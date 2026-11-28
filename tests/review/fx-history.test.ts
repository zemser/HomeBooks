import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  backfillImportedFxForWorkspace,
  reconcilePendingFxForWorkspace,
  applyFxHistoryItem,
  inventoryFxHistory,
  planHistoryRow,
  reverseFxHistoryItem,
  type HistoryRow,
} from "../../src/features/currency/backfill-imported-fx";
import { syncManualEntryExpenseEvents } from "../../src/features/reporting/expense-events";

const sample: HistoryRow = {
  id: randomUUID(),
  kind: "transaction",
  sourceDate: "2026-11-09",
  currency: "USD",
  amount: "100",
  workspaceCurrency: "ILS",
  version: "v",
  protected: false,
  duplicate: false,
  before: {
    normalizedAmount: "100",
    normalizationRate: "1",
    normalizationRateSource: null,
    valuationPolicy: "legacy",
    valuationState: "legacy",
    referenceMonth: null,
    exchangeRateId: null,
  },
};
test("history selection relies on recorded provenance and protects established balances", () => {
  const plan = (row: HistoryRow, restate = false) =>
    planHistoryRow(row, () => 3.088, restate);
  assert.equal(plan(sample).category, "review");
  assert.equal(
    plan({
      ...sample,
      before: {
        ...sample.before,
        normalizedAmount: "0",
        normalizationRate: "0",
      },
    }).category,
    "review",
  );
  const legacy: HistoryRow = {
    ...sample,
    before: {
      ...sample.before,
      normalizedAmount: "350",
      normalizationRate: "3.50",
      normalizationRateSource: "exchange-rate-monthly:boi",
    },
  };
  assert.equal(plan(legacy).category, "retained");
  assert.equal(plan(legacy, true).category, "restatement");
  assert.equal(
    plan({ ...legacy, protected: true }, true).category,
    "protected",
  );
  assert.equal(
    plan({ ...legacy, duplicate: true }, true).category,
    "duplicate",
  );
  const next = plan({
    ...sample,
    before: {
      ...sample.before,
      normalizationRateSource: "missing-monthly-rate",
    },
  });
  assert.equal(next.proposed?.normalizedAmount, "308.800000");
  assert.equal(next.rateKey?.yearMonth, "2026-10-01");
});

test(
  "FX history preview, protected settlements, worker retry, reversal and later edits",
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async () => {
    const pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const db = drizzle(pool, { schema });
    const rollback = new Error("rollback fixtures");
    try {
      await assert.rejects(
        db.transaction(async (tx) => {
          const [ws] = await tx
            .insert(schema.workspaces)
            .values({
              name: "History rehearsal",
              baseCurrency: "ILS",
              fxPolicy: "previous-month-v1",
            })
            .returning();
          const [user] = await tx
            .insert(schema.users)
            .values({
              displayName: "Alex",
              email: randomUUID() + "@example.test",
            })
            .returning();
          const [member] = await tx
            .insert(schema.workspaceMembers)
            .values({ workspaceId: ws.id, userId: user.id, role: "owner" })
            .returning();
          const context = {
            workspaceId: ws.id,
            userId: user.id,
            baseCurrency: "ILS",
            memberId: member.id,
          };
          await tx.insert(schema.exchangeRateMonthly).values({
            baseCurrency: "USD",
            quoteCurrency: "ILS",
            yearMonth: "2088-10-01",
            averageRate: "3.088",
            sourceName: "boi-monthly-v1:" + randomUUID(),
          });
          const base = {
            workspaceId: ws.id,
            sourceType: "recurring_generated" as const,
            eventKind: "expense" as const,
            title: "Recurring USD",
            originalCurrency: "USD",
            workspaceCurrency: "ILS",
            originalAmount: "100",
            normalizedAmount: "100",
            normalizationRate: "1",
            normalizationRateSource: "monthly_average-placeholder-rate-1",
            classificationType: "shared" as const,
            payerMemberId: member.id,
            eventDate: "2088-11-11",
          };
          const [editable, settled, concurrent] = await tx
            .insert(schema.manualEntries)
            .values([base, base, base])
            .returning();
          await syncManualEntryExpenseEvents(context, [settled.id], tx);
          const [event] = await tx
            .select()
            .from(schema.expenseEvents)
            .where(eq(schema.expenseEvents.sourceId, settled.id));
          const [split] = await tx
            .insert(schema.sharedExpenseSplits)
            .values({
              expenseEventId: event.id,
              splitMode: "fixed",
              settlementStatus: "settled",
              splitDefinitionJson: {},
            })
            .returning();
          const items = await inventoryFxHistory(tx, ws.id);
          assert.equal(
            items.find((i) => i.id === settled.id)?.category,
            "protected",
          );
          assert.equal(
            (
              await tx
                .select()
                .from(schema.fxHistoryAudit)
                .where(eq(schema.fxHistoryAudit.workspaceId, ws.id))
            ).length,
            0,
          );
          const runId = randomUUID(),
            date = "2088-12-01";
          assert.equal(
            await applyFxHistoryItem(
              context,
              tx,
              items.find((i) => i.id === editable.id)!,
              runId,
              date,
            ),
            "applied",
          );
          await tx
            .update(schema.manualEntries)
            .set({ title: "Changed during inventory" })
            .where(eq(schema.manualEntries.id, concurrent.id));
          assert.equal(
            await applyFxHistoryItem(
              context,
              tx,
              items.find((i) => i.id === concurrent.id)!,
              runId,
              date,
            ),
            "review",
          );
          const refreshed = await inventoryFxHistory(tx, ws.id);
          assert.equal(
            await applyFxHistoryItem(
              context,
              tx,
              refreshed.find((i) => i.id === editable.id)!,
              runId,
              date,
            ),
            "unchanged",
          );
          const [stored] = await tx
            .select()
            .from(schema.expenseEvents)
            .where(eq(schema.expenseEvents.sourceId, editable.id));
          assert.equal(stored.totalAmount, "308.800000");
          assert.deepEqual(
            (
              await tx
                .select()
                .from(schema.sharedExpenseSplits)
                .where(eq(schema.sharedExpenseSplits.id, split.id))
            )[0],
            split,
          );
          const [audit] = await tx
            .select()
            .from(schema.fxHistoryAudit)
            .where(eq(schema.fxHistoryAudit.runId, runId));
          const reverseId = randomUUID();
          const originalAllocations = await tx
            .select()
            .from(schema.expenseAllocations)
            .where(eq(schema.expenseAllocations.expenseEventId, stored.id));
          assert.equal(
            await reverseFxHistoryItem(context, tx, audit, reverseId, date),
            "applied",
          );
          const [restored] = await tx
            .select()
            .from(schema.manualEntries)
            .where(eq(schema.manualEntries.id, editable.id));
          assert.equal(restored.normalizedAmount, "100.000000");
          assert.equal(
            (
              await tx
                .select()
                .from(schema.expenseEvents)
                .where(eq(schema.expenseEvents.sourceId, editable.id))
            ).length,
            0,
          );
          assert.equal(
            await reverseFxHistoryItem(context, tx, audit, randomUUID(), date),
            "review",
          );
          const [reversal] = await tx
            .select()
            .from(schema.fxHistoryAudit)
            .where(eq(schema.fxHistoryAudit.runId, reverseId));
          assert.equal(
            await reverseFxHistoryItem(
              context,
              tx,
              reversal,
              randomUUID(),
              date,
            ),
            "applied",
          );
          assert.deepEqual(
            (
              await tx
                .select()
                .from(schema.expenseEvents)
                .where(eq(schema.expenseEvents.id, stored.id))
            )[0],
            stored,
          );
          assert.deepEqual(
            await tx
              .select()
              .from(schema.expenseAllocations)
              .where(eq(schema.expenseAllocations.expenseEventId, stored.id)),
            originalAllocations,
          );
          // A Cal row with explicit settlement fields and no Max statement section.
          const [account] = await tx
            .insert(schema.financialAccounts)
            .values({
              workspaceId: ws.id,
              accountType: "card",
              displayName: "Cal",
            })
            .returning();
          const [statement] = await tx
            .insert(schema.imports)
            .values({
              workspaceId: ws.id,
              uploadedByUserId: user.id,
              type: "bank",
              fileKind: "xlsx",
              originalFilename: "cal.xlsx",
              storagePath: "fixture",
              fileChecksum: randomUUID(),
              importStatus: "completed",
            })
            .returning();
          const [cal] = await tx
            .insert(schema.transactions)
            .values({
              workspaceId: ws.id,
              accountId: account.id,
              importId: statement.id,
              description: "Cal payment",
              direction: "debit",
              dedupeHash: randomUUID(),
              transactionDate: "2088-11-22",
              settlementAmount: "100",
              settlementCurrency: "USD",
              workspaceCurrency: "ILS",
              originalAmount: "130",
              originalCurrency: "CAD",
              normalizedAmount: "0",
              normalizationRate: "0",
              normalizationRateSource: "missing-monthly-rate",
              valuationPolicy: "previous-month-v1",
              valuationState: "pending",
              referenceMonth: "2088-10-01",
            })
            .returning();
          const key = {
            baseCurrency: "USD",
            quoteCurrency: "ILS",
            yearMonth: "2088-10-01",
          };
          assert.deepEqual(
            await reconcilePendingFxForWorkspace(context, tx, key),
            { updatedCount: 1 },
          );
          assert.deepEqual(
            await reconcilePendingFxForWorkspace(context, tx, key),
            { updatedCount: 0 },
          );
          const [converted] = await tx
            .select()
            .from(schema.transactions)
            .where(eq(schema.transactions.id, cal.id));
          assert.equal(converted.normalizedAmount, "308.800000");
          assert.equal(converted.originalCurrency, "CAD");
          await tx
            .update(schema.workspaces)
            .set({ fxPolicy: "legacy" })
            .where(eq(schema.workspaces.id, ws.id));
          await tx
            .update(schema.transactions)
            .set({
              normalizationRateSource: "preview-placeholder-rate-1",
              valuationPolicy: "legacy",
              valuationState: "legacy",
              normalizedAmount: "100",
              normalizationRate: "1",
              referenceMonth: null,
              exchangeRateId: null,
            })
            .where(eq(schema.transactions.id, cal.id));
          await tx.insert(schema.exchangeRateMonthly).values({
            ...key,
            yearMonth: "2088-11-01",
            averageRate: "3.5",
            sourceName: "boi-monthly-v1:" + randomUUID(),
          });
          assert.deepEqual(await backfillImportedFxForWorkspace(context, tx), {
            updatedCount: 1,
          });
          assert.deepEqual(await backfillImportedFxForWorkspace(context, tx), {
            updatedCount: 0,
          });
          const [legacy] = await tx
            .select()
            .from(schema.transactions)
            .where(eq(schema.transactions.id, cal.id));
          assert.equal(legacy.normalizedAmount, "350.000000");
          assert.equal(legacy.valuationPolicy, "legacy");
          throw rollback;
        }),
        (e) => e === rollback,
      );
    } finally {
      await pool.end();
    }
  },
);
