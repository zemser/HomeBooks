import Big from "big.js";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import type { HistoryItem } from "../src/features/currency/backfill-imported-fx";

createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());

const { and, eq, sql } = await import("drizzle-orm");
const { getDb, withDbTransaction } = await import("../src/db");
const { fxHistoryAudit, workspaces, workspaceMembers } =
  await import("../src/db/schema");
const { inventoryFxHistory, applyFxHistoryItem, reverseFxHistoryItem } =
  await import("../src/features/currency/backfill-imported-fx");
const { requestMissingFxRates } =
  await import("../src/features/currency/rate-requests");

const { values } = parseArgs({
  options: {
    workspace: { type: "string" },
    output: { type: "string" },
    apply: { type: "string" },
    reverse: { type: "string" },
    restate: { type: "boolean" },
    "effective-date": { type: "string" },
    "set-policy": { type: "string" },
    "request-rates": { type: "boolean" },
  },
});
const workspaceId = values.workspace ?? process.env.WORKSPACE_ID;
const modes = [
  values.apply,
  values.reverse,
  values["set-policy"],
  values["request-rates"],
].filter(Boolean);
if (modes.length > 1 || (modes.length && !workspaceId))
  throw Error("Choose one write operation and specify --workspace.");
if (modes.length && values.output)
  throw Error("--output saves a read-only inventory.");
const date = values["effective-date"] ?? new Date().toISOString().slice(0, 10);
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
  new Date(date).toISOString().slice(0, 10) !== date
)
  throw Error("Invalid effective date.");
if (values.restate && !values["effective-date"])
  throw Error(
    "Select an explicit --effective-date for a historical restatement.",
  );

type Inventory = {
  format: 1;
  runId: string;
  workspaceId: string;
  effectiveDate: string;
  restate: boolean;
  rows: HistoryItem[];
};
function summarize(rows: HistoryItem[]) {
  type Summary = {
    counts: Record<string, number>;
    grossBefore: Big;
    paymentDate: Record<
      string,
      Record<string, { before: string; after: string }>
    >;
    grossAfter: Big;
    pending: Record<string, string>;
    available: Set<string>;
    missing: Set<string>;
  };
  const months = new Map<string, Summary>();
  for (const row of rows) {
    const month = row.sourceDate.slice(0, 7);
    const summary =
      months.get(month) ??
      ({
        counts: {},
        grossBefore: new Big(0),
        paymentDate: {},
        grossAfter: new Big(0),
        pending: {},
        available: new Set(),
        missing: new Set(),
      } as Summary);
    summary.counts[row.category] = (summary.counts[row.category] ?? 0) + 1;
    const change =
      ["pending", "recorded", "repair", "restatement"].includes(row.category) &&
      row.proposed;
    const next = change || row.before;
    const beforeAmount = new Big(
      row.before.valuationState === "pending" ? 0 : row.before.normalizedAmount,
    );
    const afterAmount = new Big(
      next.valuationState === "pending" ? 0 : next.normalizedAmount,
    );
    summary.grossBefore = summary.grossBefore.plus(beforeAmount.abs());
    summary.grossAfter = summary.grossAfter.plus(afterAmount.abs());
    if (
      row.classification &&
      ["shared", "personal", "income"].includes(row.classification)
    ) {
      const members = (summary.paymentDate[row.classification] ??= {});
      const member = row.attributedMemberId ?? "unassigned";
      const totals = members[member] ?? { before: "0", after: "0" };
      const sign = row.linkedRefund && row.classification !== "income" ? -1 : 1;
      members[member] = {
        before: new Big(totals.before)
          .plus(beforeAmount.times(sign))
          .toFixed(2),
        after: new Big(totals.after).plus(afterAmount.times(sign)).toFixed(2),
      };
    }
    if (next.valuationState === "pending" && row.amount !== null) {
      const currency = row.currency ?? "unknown";
      summary.pending[currency] = new Big(summary.pending[currency] ?? 0)
        .plus(row.amount)
        .toString();
    }
    if (row.rateKey && row.proposed) {
      const key = [
        row.rateKey.baseCurrency,
        row.rateKey.quoteCurrency,
        row.rateKey.yearMonth,
      ].join("/");
      (row.proposed.valuationState === "pending"
        ? summary.missing
        : summary.available
      ).add(key);
    }
    months.set(month, summary);
  }
  return Object.fromEntries(
    [...months].map(([month, s]) => [
      month,
      {
        ...s,
        grossBefore: s.grossBefore.toFixed(2),
        grossAfter: s.grossAfter.toFixed(2),
        missing: [...s.missing],
        available: [...s.available],
      },
    ]),
  );
}

const db = getDb();
const all = await db
  .select({
    id: workspaces.id,
    baseCurrency: workspaces.baseCurrency,
    policy: workspaces.fxPolicy,
  })
  .from(workspaces)
  .where(workspaceId ? eq(workspaces.id, workspaceId) : undefined);
if (!all.length)
  throw Error(
    "No matching workspace. Use a maintenance connection for workspace discovery.",
  );
if (values.output && all.length !== 1)
  throw Error("Select one workspace per saved inventory.");
for (const ws of all) {
  const [member] = await db
    .select({ memberId: workspaceMembers.id, userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, ws.id),
        eq(workspaceMembers.isActive, true),
      ),
    )
    .orderBy(
      sql`case when ${workspaceMembers.role}='owner' then 0 else 1 end`,
      workspaceMembers.id,
    )
    .limit(1);
  if (!member) {
    console.error(`Skipping workspace ${ws.id} with no active member.`);
    continue;
  }
  const context = {
    ...member,
    workspaceId: ws.id,
    baseCurrency: ws.baseCurrency,
  };
  const policy = values["set-policy"];
  if (policy) {
    if (policy !== "legacy" && policy !== "previous-month-v1")
      throw Error("Unknown FX policy.");
    const updated = await withDbTransaction(member.userId, (tx) =>
      tx
        .update(workspaces)
        .set({ fxPolicy: policy })
        .where(eq(workspaces.id, ws.id))
        .returning({ id: workspaces.id }),
    );
    if (!updated.length)
      throw Error(
        "An active workspace owner is required to change this policy.",
      );
    console.log(JSON.stringify({ workspace: ws.id, policy }));
    continue;
  }
  if (values.reverse) {
    const audits = await withDbTransaction(
      member.userId,
      (tx) =>
        tx
          .select()
          .from(fxHistoryAudit)
          .where(
            and(
              eq(fxHistoryAudit.runId, values.reverse!),
              eq(fxHistoryAudit.workspaceId, ws.id),
            ),
          ),
      { readOnly: true },
    );
    if (!audits.length)
      throw Error("No audit rows for this run and workspace.");
    const reversalId = randomUUID();
    for (const audit of audits) {
      const status = await withDbTransaction(member.userId, (tx) =>
        reverseFxHistoryItem(context, tx, audit, reversalId, date),
      );
      console.log(
        JSON.stringify({ reversalId, sourceId: audit.sourceId, status }),
      );
    }
    continue;
  }
  const queueMissing = async (selected?: Set<string>) =>
    withDbTransaction(member.userId, async (tx) => {
      const rows = await inventoryFxHistory(tx, ws.id, values.restate);
      const keys = rows.flatMap((r) =>
        (!selected || selected.has(r.kind + r.id)) &&
        r.proposed?.valuationState === "pending" &&
        r.rateKey
          ? [r.rateKey]
          : [],
      );
      await requestMissingFxRates(tx, keys);
    });
  if (values["request-rates"]) {
    await queueMissing();
    console.log(
      JSON.stringify({
        workspace: ws.id,
        message:
          "Submitted supported missing monthly rate keys. Run a fresh preview after the worker drains them.",
      }),
    );
    continue;
  }
  if (values.apply) {
    const inventory: Inventory = JSON.parse(
      await readFile(values.apply, "utf8"),
    );
    if (ws.policy !== "previous-month-v1")
      throw Error(
        "Enable this workspace with --set-policy previous-month-v1 before applying.",
      );
    if (
      inventory.format !== 1 ||
      inventory.workspaceId !== ws.id ||
      inventory.restate !== Boolean(values.restate) ||
      (inventory.restate && inventory.effectiveDate !== date)
    )
      throw Error(
        "Workspace, restatement choice, or effective date differs from the inventory.",
      );
    for (const row of inventory.rows) {
      const status = await withDbTransaction(member.userId, async (tx) => {
        const [applied] = await tx
          .select({ id: fxHistoryAudit.id })
          .from(fxHistoryAudit)
          .where(
            and(
              eq(fxHistoryAudit.runId, inventory.runId),
              eq(fxHistoryAudit.workspaceId, ws.id),
              eq(fxHistoryAudit.sourceId, row.id),
              eq(fxHistoryAudit.sourceKind, row.kind),
            ),
          );
        if (applied) return "already-applied";
        const status = await applyFxHistoryItem(
          context,
          tx,
          row,
          inventory.runId,
          inventory.effectiveDate,
          inventory.restate,
        );
        return status;
      });
      if (status !== "unchanged")
        console.log(
          JSON.stringify({ runId: inventory.runId, sourceId: row.id, status }),
        );
    }
    await queueMissing(new Set(inventory.rows.map((row) => row.kind + row.id)));
    continue;
  }
  const rows = await withDbTransaction(
    member.userId,
    (tx) => inventoryFxHistory(tx, ws.id, values.restate),
    { readOnly: true },
  );
  const inventory: Inventory = {
    format: 1,
    runId: randomUUID(),
    workspaceId: ws.id,
    effectiveDate: date,
    restate: Boolean(values.restate),
    rows,
  };
  const summary = summarize(rows);
  if (values.output)
    await writeFile(
      values.output,
      JSON.stringify({ ...inventory, summary }, null, 2),
      { flag: "wx", mode: 0o600 },
    );
  console.log(
    JSON.stringify(
      { ...inventory, summary, rows: values.output ? undefined : rows },
      null,
      2,
    ),
  );
}
