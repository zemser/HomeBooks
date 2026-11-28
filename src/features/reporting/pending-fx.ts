import Big from "big.js";
import { sql } from "drizzle-orm";
import type { DbExecutor } from "@/db";

export type PendingFxAmount = {
  currency: string | null;
  amount: string;
  count: number;
  flow: "credit" | "debit";
};

export function combinePendingFx(months: Iterable<PendingFxAmount[]>) {
  const totals = new Map<string, PendingFxAmount>();
  for (const items of months) {
    for (const item of items) {
      const key = [item.currency, item.flow].join("|");
      const previous = totals.get(key);
      totals.set(key, previous ? {
        ...item, count: previous.count + item.count,
        amount: Big(previous.amount).plus(item.amount).toString(),
      } : {...item});
    }
  }
  return [...totals.values()];
}

export function describePendingFx(amounts?: PendingFxAmount[]) {
  return (
    amounts
      ?.map(({ currency, amount, count, flow }) =>
        currency
          ? `${currency} ${Big(amount).toFixed()} awaiting conversion (${count} ${flow === "credit" ? "incoming" : "outgoing"})`
          : `${count} awaiting currency confirmation`,
      )
      .join(" · ") ?? ""
  );
}

export async function pendingFxByMonth(
  db: DbExecutor,
  workspaceId: string,
  start: string,
  end: string,
) {
  const { rows } = await db.execute<PendingFxAmount & { month: string }>(sql`
    select date_trunc('month', day)::date::text as month, currency, flow,
      sum(abs(amount))::text as amount, count(*)::int as count
    from (
      select t.transaction_date as day, case when t.settlement_amount is null then t.original_currency else t.settlement_currency end as currency, t.direction as flow,
        coalesce(t.settlement_amount, t.original_amount) as amount
      from transactions t left join transaction_classifications c on c.transaction_id = t.id
      where t.workspace_id = ${workspaceId} and t.transaction_date >= ${start} and t.transaction_date < ${end}
        and coalesce(c.classification_type::text, '') not in ('ignore','transfer')
        and (t.valuation_state = 'pending' or t.normalization_rate_source like '%missing-monthly-rate%')
      union all
      select event_date, original_currency, case when event_kind = 'income' then 'credit' else 'debit' end, original_amount from manual_entries
      where workspace_id = ${workspaceId} and event_date >= ${start} and event_date < ${end}
        and classification_type not in ('ignore','transfer') and valuation_state = 'pending'
    ) pending group by 1, 2, 3 order by 1, 2, 3
  `);
  const byMonth = new Map<string, PendingFxAmount[]>();
  for (const { month, currency, amount, count, flow } of rows) {
    const group = byMonth.get(month) ?? [];
    group.push({ currency, amount, count, flow });
    byMonth.set(month, group);
  }
  return byMonth;
}
