import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../src/db/schema";
import { getMonthlyReport } from "../../src/features/reporting/monthly-report";
import { buildReportHistoryHref, parseReportLineItemSlice } from "../../src/features/reporting/line-item-slice";

test("report load preserves IDs and source context independently of allocation date and amount", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = drizzle(pool, { schema });
  const rollback = new Error("rollback report fixtures");
  try {
    await assert.rejects(db.transaction(async (tx) => {
      const [workspace] = await tx.insert(schema.workspaces).values({ name: "Drilldown test", baseCurrency: "ILS" }).returning();
      const [user] = await tx.insert(schema.users).values({ displayName: "Historical member", email: `${randomUUID()}@example.test` }).returning();
      const [member] = await tx.insert(schema.workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: "owner", isActive: false }).returning();
      const [category] = await tx.insert(schema.workspaceCategories).values({ workspaceId: workspace.id, name: "Housing", canonicalName: "housing", active: false }).returning();
      const context = { workspaceId: workspace.id, userId: user.id, memberId: member.id, baseCurrency: "ILS" };
      const [account] = await tx.insert(schema.financialAccounts).values({ workspaceId: workspace.id, accountType: "bank", displayName: "Test" }).returning();
      const [batch] = await tx.insert(schema.imports).values({ workspaceId: workspace.id, uploadedByUserId: user.id, type: "bank", fileKind: "csv", originalFilename: "test.csv", storagePath: "test", fileChecksum: randomUUID(), importStatus: "completed" }).returning();
      const [transaction] = await tx.insert(schema.transactions).values({ workspaceId: workspace.id, accountId: account.id, importId: batch.id, transactionDate: "2026-08-15", description: "August bill", originalCurrency: "ILS", originalAmount: "600", workspaceCurrency: "ILS", normalizedAmount: "600", direction: "debit", dedupeHash: randomUUID() }).returning();
      await tx.insert(schema.transactionClassifications).values({ transactionId: transaction.id, classificationType: "personal", personalOwnerMemberId: member.id, categoryId: category.id, category: "Housing", decidedBy: "user" });
      const sources: { id: string; type: "transaction" | "manual" | "recurring" }[] = [{ id: transaction.id, type: "transaction" }];
      for (const sourceType of ["one_time_manual", "recurring_generated"] as const) {
        const [entry] = await tx.insert(schema.manualEntries).values({ workspaceId: workspace.id, sourceType, eventKind: "expense", title: sourceType, originalCurrency: "ILS", originalAmount: "600", workspaceCurrency: "ILS", normalizedAmount: "600", classificationType: "personal", personalOwnerMemberId: member.id, categoryId: category.id, category: "Housing", eventDate: "2026-08-15" }).returning();
        sources.push({ id: entry.id, type: sourceType === "one_time_manual" ? "manual" : "recurring" });
      }
      // An orphaned projection must not invent a source date or amount.
      const missingId = randomUUID();
      sources.push({ id: missingId, type: "transaction" });
      for (const source of sources) {
        const [event] = await tx.insert(schema.expenseEvents).values({ workspaceId: workspace.id, sourceType: source.type, sourceId: source.id, eventKind: "expense", title: source.id, totalAmount: "600", workspaceCurrency: "ILS", classificationType: "personal", personalOwnerMemberId: member.id, categoryId: category.id, category: "Housing", reportingMode: "allocated_period" }).returning();
        await tx.insert(schema.expenseAllocations).values({ expenseEventId: event.id, reportMonth: "2026-06-01", allocatedAmount: "300", allocationMethod: "manual_split" });
      }
      const allocated = await getMonthlyReport(context, { month: "2026-06", mode: "allocated_period" }, tx);
      assert.equal(allocated.lineItems.length, 4);
      for (const row of allocated.lineItems) {
        assert.equal(row.eventDate, "2026-06-01");
        assert.equal(row.normalizedAmount, 300);
        assert.equal(row.categoryId, category.id);
        assert.equal(row.memberId, member.id);
        if (row.sourceRecordId === missingId) {
          assert.equal(row.sourceEventDate, null);
          assert.equal(row.sourceNormalizedAmount, null);
          assert.equal(buildReportHistoryHref(row), null);
        } else {
          assert.equal(row.sourceEventDate, "2026-08-15");
          assert.equal(row.sourceNormalizedAmount, 600);
          assert.equal(buildReportHistoryHref(row), row.sourceKind === "imported_transaction" ? `/transactions/all?transactionId=${transaction.id}&month=2026-08` : null);
        }
      }
      const payment = await getMonthlyReport(context, { month: "2026-08", mode: "payment_date" }, tx);
      assert.equal(payment.lineItems.length, 3);
      for (const row of payment.lineItems) {
        assert.equal(row.sourceEventDate, row.eventDate);
        assert.equal(row.sourceNormalizedAmount, row.normalizedAmount);
      }
      const empty = await getMonthlyReport(context, { month: "2026-01" }, tx);
      assert.equal(empty.lineItems.length, 0);
      assert.equal(parseReportLineItemSlice(new URLSearchParams({ kind: "personal", member: member.id, category: category.id }), empty.sliceMetadata).status, "valid");
      throw rollback;
    }), (error) => error === rollback);
  } finally { await pool.end(); }
});
