// History migration and worker reconciliation share the same protection and audit checks.
import Big from "big.js";
import { inferMaxSectionCurrency } from "@/features/imports/templates/max-fx";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { withDbTransaction, type DbExecutor } from "@/db";
import {
  fxHistoryAudit,
  manualEntries,
  transactions,
  workspaces,
} from "@/db/schema";
import {
  createMonthlyAverageNormalizer,
  createRateLookupFromMap,
  loadSeededMonthlyRates,
  previousMonthFromTransactionDate,
  yearMonthFromTransactionDate,
  type CurrencyRateLookup,
} from "./monthly-rates";
import {
  syncManualEntryExpenseEvents,
  syncTransactionExpenseEvents,
} from "@/features/reporting/expense-events";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";

type Kind = "transaction" | "manual" | "recurring";
type Snapshot = {
  normalizedAmount: string;
  normalizationRate: string | null;
  normalizationRateSource: string | null;
  valuationState: "legacy" | "pending" | "recorded" | "converted";
  valuationPolicy: "legacy" | "previous-month-v1";
  referenceMonth: string | null;
  exchangeRateId: string | null;
};
export type HistoryRow = {
  id: string;
  kind: Kind;
  sourceDate: string;
  currency: string | null;
  amount: string | null;
  workspaceCurrency: string;
  statementSection?: string | null;
  classification?: string | null;
  attributedMemberId?: string | null;
  linkedRefund?: boolean;
  projection?: string;
  version: string;
  protected: boolean;
  duplicate: boolean;
  before: Snapshot;
};
type Category =
  | "recorded"
  | "retained"
  | "repair"
  | "pending"
  | "review"
  | "protected"
  | "duplicate"
  | "restatement";
type RateKey = {
  baseCurrency: string;
  quoteCurrency: string;
  yearMonth: string;
};
export type HistoryItem = HistoryRow & {
  category: Category;
  proposed: Snapshot | null;
  rateKey: RateKey | null;
};
type Scope = {
  id?: string;
  kind?: Kind;
  pending?: RateKey | true;
  legacy?: boolean;
};

function pendingPredicate(
  currency: ReturnType<typeof sql>,
  key: Scope["pending"],
) {
  if (!key) return sql`true`;
  if (key === true) return sql`s.valuation_state='pending'`;
  return sql`s.valuation_state='pending' and s.reference_month=${key.yearMonth}::date
    and ((${currency}=${key.baseCurrency} and s.workspace_currency=${key.quoteCurrency})
      or (${currency}=${key.quoteCurrency} and s.workspace_currency=${key.baseCurrency}))`;
}

async function loadRows(
  db: DbExecutor,
  workspaceId: string,
  scope: Scope = {},
) {
  const id = scope.id ? sql`s.id=${scope.id}::uuid` : sql`true`;
  // Include allocation and split IDs/versions in the comparison. A later human edit
  // invalidates both an inventory and a potential reversal of an applied change.
  const result = await db.execute(sql`
    with sources as (
      select s.id, 'transaction' as kind, s.transaction_date as date, s.settlement_amount as amount,
        s.settlement_currency as currency, s.workspace_currency, to_jsonb(s) as data,
        (select to_jsonb(c) from transaction_classifications c where c.transaction_id=s.id) as classification,
        exists(select from transactions d where d.workspace_id=s.workspace_id and d.account_id=s.account_id
          and d.transaction_date=s.transaction_date and d.description=s.description
          and d.settlement_amount is not distinct from s.settlement_amount
          and d.settlement_currency is not distinct from s.settlement_currency
          and d.external_reference is not distinct from s.external_reference and d.id<>s.id) as duplicate,
        null::jsonb as overrides,
        (s.refund_of_transaction_id is not null or exists(select from transactions f where f.workspace_id=s.workspace_id and f.refund_of_transaction_id=s.id)) as linked_refund
      from transactions s where s.workspace_id=${workspaceId} and ${id} and ${scope.kind == null || scope.kind === "transaction"}
        and ${scope.legacy ? sql`s.valuation_policy='legacy' and (s.valuation_state='pending' or s.normalization_rate_source like '%placeholder-rate-1' or s.normalization_rate_source like '%missing-monthly-rate%')` : sql`true`}
        and ${pendingPredicate(sql`s.settlement_currency`, scope.pending)}
      union all
      select s.id, case when s.source_type='recurring_generated' then 'recurring' else 'manual' end,
        s.event_date,s.original_amount,s.original_currency,s.workspace_currency,to_jsonb(s),null,false,
        (select jsonb_agg(to_jsonb(o) order by o.id) from manual_entry_overrides o where o.manual_entry_id=s.id),false
      from manual_entries s where s.workspace_id=${workspaceId} and ${id} and ${scope.kind !== "transaction" && !scope.legacy}
        and ${pendingPredicate(sql`s.original_currency`, scope.pending)}
    )
    select s.id,s.kind,s.date::text as "sourceDate",s.amount::text,s.currency,s.workspace_currency as "workspaceCurrency",
      ${scope.id ? sql`coalesce(related.events,'[]'::jsonb)::text` : sql`null`} as projection,
      s.data->>'statement_section' as "statementSection",
      coalesce(s.classification,s.data)->>'classification_type' as classification,
      case coalesce(s.classification,s.data)->>'classification_type'
        when 'shared' then coalesce(s.classification->>'paid_by_member_id',s.data->>'payer_member_id')
        when 'personal' then coalesce(s.classification,s.data)->>'personal_owner_member_id'
        when 'income' then coalesce(s.classification,s.data)->>'received_by_member_id'
      end as "attributedMemberId",
      (s.data->>'refund_of_transaction_id' is not null) as "linkedRefund",
      md5(jsonb_build_array(s.data,s.classification,s.overrides,related.events,s.duplicate,s.linked_refund)::text) as version,
      s.duplicate, (s.linked_refund or exists(select from jsonb_array_elements(s.overrides) o
        where o->>'override_type' in ('amount','skip')) or coalesce(related.protected,false) or related.count>1) as protected,
      jsonb_build_object('normalizedAmount',s.data->>'normalized_amount','normalizationRate',s.data->>'normalization_rate',
        'normalizationRateSource',s.data->>'normalization_rate_source','valuationState',s.data->>'valuation_state',
        'valuationPolicy',s.data->>'valuation_policy','referenceMonth',s.data->>'reference_month',
        'exchangeRateId',s.data->>'exchange_rate_id') as before
    from sources s cross join lateral (
      select count(*) as count,jsonb_agg(jsonb_build_array(to_jsonb(e),a.items,sp.items) order by e.id) as events,
        bool_or(e.reporting_mode='allocated_period' or a.protected or sp.items is not null) as protected
      from expense_events e
      cross join lateral (select jsonb_agg(to_jsonb(a) order by a.id) as items,
        bool_or(a.allocation_method<>'single_month') as protected from expense_allocations a where a.expense_event_id=e.id) a
      cross join lateral (select jsonb_agg(to_jsonb(sp) order by sp.id) as items
        from shared_expense_splits sp where sp.expense_event_id=e.id) sp
      where e.workspace_id=${workspaceId} and e.source_id=s.id and e.source_type::text=s.kind
    ) related order by s.date,s.kind,s.id`);
  return result.rows as unknown as HistoryRow[];
}

export function planHistoryRow(
  row: HistoryRow,
  rates: CurrencyRateLookup,
  restate = false,
  legacy = false,
): HistoryItem {
  const source = row.before.normalizationRateSource ?? "";
  const key =
    row.currency && row.currency !== row.workspaceCurrency
      ? {
          baseCurrency: row.currency,
          quoteCurrency: row.workspaceCurrency,
          yearMonth: legacy
            ? yearMonthFromTransactionDate(row.sourceDate)
            : previousMonthFromTransactionDate(row.sourceDate),
        }
      : null;
  const item = (
    category: Category,
    proposed: Snapshot | null = null,
  ): HistoryItem => ({ ...row, category, proposed, rateKey: key });
  if (row.duplicate) return item("duplicate");
  if (!row.currency || row.amount === null) return item("review");
  const sectionCurrency = inferMaxSectionCurrency(row.statementSection);
  if (sectionCurrency !== "ILS" && sectionCurrency !== row.currency)
    return item("review");
  const previous = row.before;
  if (
    previous.valuationPolicy === "previous-month-v1" &&
    previous.valuationState !== "pending"
  )
    return item("retained");
  const placeholder =
    previous.valuationState === "pending" ||
    source.includes("missing-monthly-rate") ||
    source.endsWith("placeholder-rate-1");
  const legacyConversion =
    previous.valuationState === "legacy" &&
    source.startsWith("exchange-rate-monthly:") &&
    Number(previous.normalizationRate) > 0 &&
    key !== null;
  if (
    !key &&
    Number(previous.normalizedAmount) !== Number(row.amount) &&
    !placeholder
  )
    return item("review");
  if (key && !placeholder && !legacyConversion) return item("review");
  if (
    legacyConversion &&
    new Big(row.amount)
      .times(previous.normalizationRate!)
      .minus(previous.normalizedAmount)
      .abs()
      .gt("0.005001")
  )
    return item("review");
  const policy = legacy ? "legacy" : "previous-month-v1";
  const next = createMonthlyAverageNormalizer(
    row.workspaceCurrency,
    rates,
    policy,
  )({
    amount: Number(row.amount),
    fromCurrency: row.currency,
    transactionDate: row.sourceDate,
  });
  const proposed: Snapshot = {
    normalizedAmount: next.normalizedAmount.toFixed(6),
    normalizationRate: next.normalizationRate.toFixed(8),
    normalizationRateSource: next.normalizationRateSource,
    valuationState: next.valuationState,
    valuationPolicy: policy,
    referenceMonth: next.referenceMonth ?? null,
    exchangeRateId: next.exchangeRateId ?? null,
  };
  if (legacyConversion && (!restate || proposed.valuationState === "pending"))
    return item("retained", proposed);
  if (row.protected) return item("protected", proposed);
  if (proposed.valuationState === "pending") return item("pending", proposed);
  return item(
    legacyConversion ? "restatement" : key ? "repair" : "recorded",
    proposed,
  );
}

export async function inventoryFxHistory(
  db: DbExecutor,
  workspaceId: string,
  restate = false,
  scope: Scope = {},
) {
  const rows = await loadRows(db, workspaceId, scope);
  const months = rows.map((row) =>
    scope.legacy
      ? yearMonthFromTransactionDate(row.sourceDate)
      : previousMonthFromTransactionDate(row.sourceDate),
  );
  const rates = createRateLookupFromMap(
    await loadSeededMonthlyRates(db, months),
  );
  return rows.map((row) => planHistoryRow(row, rates, restate, scope.legacy));
}

function writable(item: HistoryItem) {
  return (
    ["recorded", "repair", "pending", "restatement"].includes(item.category) &&
    item.proposed &&
    Object.keys(item.before).some(
      (k) =>
        item.before[k as keyof Snapshot] !==
        item.proposed![k as keyof Snapshot],
    )
  );
}

async function lockSource(
  db: DbExecutor,
  workspaceId: string,
  kind: Kind,
  id: string,
) {
  const table = kind === "transaction" ? transactions : manualEntries;
  const result = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.workspaceId, workspaceId), eq(table.id, id)))
    .for("update");
  if (!result.length) return false;
  // Parent locks also serialize foreign-key checks on newly created child rows.
  if (kind === "transaction")
    await db.execute(
      sql`select id from transaction_classifications where transaction_id=${id} for update`,
    );
  else
    await db.execute(
      sql`select id from manual_entry_overrides where manual_entry_id=${id} order by id for update`,
    );
  const events = sql`select id from expense_events where workspace_id=${workspaceId} and source_type=${kind} and source_id=${id}`;
  await db.execute(sql`${events} order by id for update`);
  await db.execute(
    sql`select id from expense_allocations where expense_event_id in (${events}) order by id for update`,
  );
  await db.execute(
    sql`select id from shared_expense_splits where expense_event_id in (${events}) order by id for update`,
  );
  return true;
}

async function writeSnapshot(
  context: CurrentWorkspaceContext,
  db: DbExecutor,
  item: HistoryRow,
  value: Snapshot,
  runId: string,
  reason: string,
  effectiveDate: string,
  restoreProjection?: string,
) {
  const table = item.kind === "transaction" ? transactions : manualEntries;
  await db
    .update(table)
    .set({ ...value, updatedAt: new Date() })
    .where(
      and(eq(table.id, item.id), eq(table.workspaceId, context.workspaceId)),
    );
  const sync =
    item.kind === "transaction"
      ? syncTransactionExpenseEvents
      : syncManualEntryExpenseEvents;
  if (restoreProjection === undefined) {
    await sync(context, [item.id], db);
  } else {
    // Recreate the exact projection, including original allocation IDs, dates and
    // the absence of an event. Source, event and child rows are already locked.
    const ids = sql`select id from expense_events where workspace_id=${context.workspaceId} and source_type=${item.kind} and source_id=${item.id}`;
    await db.execute(
      sql`delete from expense_allocations where expense_event_id in (${ids})`,
    );
    await db.execute(sql`delete from expense_events where id in (${ids})`);
    const snapshot = sql`jsonb_array_elements(${restoreProjection}::jsonb) entry`;
    await db.execute(sql`insert into expense_events select e.* from ${snapshot}
      cross join lateral jsonb_populate_record(null::expense_events,entry->0) e
      where e.workspace_id=${context.workspaceId} and e.source_type=${item.kind} and e.source_id=${item.id}`);
    await db.execute(sql`insert into expense_allocations select a.* from ${snapshot}
      cross join lateral jsonb_populate_recordset(null::expense_allocations,coalesce(nullif(entry->1,'null'::jsonb),'[]'::jsonb)) a
      where a.expense_event_id in (${ids})`);
  }
  const [after] = await loadRows(db, context.workspaceId, {
    id: item.id,
    kind: item.kind,
  });
  await db.insert(fxHistoryAudit).values({
    workspaceId: context.workspaceId,
    runId,
    sourceKind: item.kind,
    sourceId: item.id,
    reason,
    effectiveDate,
    beforeValue: { ...item.before, projection: item.projection },
    afterValue: { ...after.before, projection: after.projection },
    afterVersion: after.version,
  });
}

// The caller owns the transaction. Re-derive the proposed value server-side after locking;
// a saved inventory contains evidence and IDs, never authority to set a rate or amount.
export async function applyFxHistoryItem(
  context: CurrentWorkspaceContext,
  db: DbExecutor,
  expected: HistoryItem,
  runId: string,
  effectiveDate: string,
  restate = false,
  legacy = false,
) {
  if (!writable(expected)) return "unchanged";
  const [workspace] = await db
    .select({ policy: workspaces.fxPolicy })
    .from(workspaces)
    .where(eq(workspaces.id, context.workspaceId))
    .for("share");
  if (workspace?.policy !== (legacy ? "legacy" : "previous-month-v1"))
    return "review";
  if (!(await lockSource(db, context.workspaceId, expected.kind, expected.id)))
    return "review";
  const [current] = await inventoryFxHistory(db, context.workspaceId, restate, {
    id: expected.id,
    kind: expected.kind,
    legacy,
  });
  if (
    !current ||
    current.version !== expected.version ||
    !writable(current) ||
    !current.proposed ||
    JSON.stringify(current.proposed) !== JSON.stringify(expected.proposed)
  )
    return "review";
  await writeSnapshot(
    context,
    db,
    current,
    current.proposed,
    runId,
    current.category,
    effectiveDate,
  );
  return "applied";
}

export async function reverseFxHistoryItem(
  context: CurrentWorkspaceContext,
  db: DbExecutor,
  audit: typeof fxHistoryAudit.$inferSelect,
  reversalId: string,
  effectiveDate: string,
) {
  const kind = audit.sourceKind as Kind;
  if (
    audit.workspaceId !== context.workspaceId ||
    !(await lockSource(db, context.workspaceId, kind, audit.sourceId))
  )
    return "review";
  const [current] = await loadRows(db, context.workspaceId, {
    kind,
    id: audit.sourceId,
  });
  if (
    !current ||
    current.protected ||
    current.duplicate ||
    current.version !== audit.afterVersion
  )
    return "review";
  const { projection, ...value } = audit.beforeValue as Snapshot & {
    projection?: string;
  };
  if (projection === undefined) return "review";
  await writeSnapshot(
    context,
    db,
    current,
    value,
    reversalId,
    `reverse:${audit.runId}`,
    effectiveDate,
    projection,
  );
  return "applied";
}

export async function reconcilePendingFxForWorkspace(
  context: CurrentWorkspaceContext,
  db: DbExecutor,
  key?: RateKey,
) {
  const [workspace] = await db
    .select({ policy: workspaces.fxPolicy })
    .from(workspaces)
    .where(eq(workspaces.id, context.workspaceId));
  if (workspace?.policy !== "previous-month-v1") return { updatedCount: 0 };
  const rows = await inventoryFxHistory(db, context.workspaceId, false, {
    pending: key ?? true,
  });
  let updatedCount = 0;
  const runId = randomUUID();
  for (const row of rows) {
    if (
      (await applyFxHistoryItem(
        context,
        db,
        row,
        runId,
        new Date().toISOString().slice(0, 10),
      )) === "applied"
    )
      updatedCount++;
  }
  return { updatedCount };
}

export async function reconcilePendingFxForRate(db: DbExecutor, key: RateKey) {
  const contexts = await db.execute(
    sql`select * from public.fx_repair_workspaces(${key.baseCurrency},${key.quoteCurrency},${key.yearMonth}::date)`,
  );
  for (const context of contexts.rows as unknown as CurrentWorkspaceContext[]) {
    await withDbTransaction(context.userId, (tx) =>
      reconcilePendingFxForWorkspace(context, tx, key),
    );
  }
}

// While a workspace uses the original policy, an import may still repair an
// explicitly marked imported placeholder with its transaction-month rate.
export async function backfillImportedFxForWorkspace(
  context: CurrentWorkspaceContext,
  db: DbExecutor,
) {
  const rows = await inventoryFxHistory(db, context.workspaceId, false, {
    legacy: true,
    kind: "transaction",
  });
  const runId = randomUUID();
  let updatedCount = 0;
  for (const row of rows) {
    if (row.category !== "repair" && row.category !== "recorded") continue;
    if (
      (await applyFxHistoryItem(
        context,
        db,
        row,
        runId,
        new Date().toISOString().slice(0, 10),
        false,
        true,
      )) === "applied"
    )
      updatedCount++;
  }
  return { updatedCount };
}
