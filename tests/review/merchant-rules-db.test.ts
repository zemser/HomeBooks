import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { upsertTransactionClassification, undoClassificationDecision, stopMerchantRule } from "../../src/features/expenses/classifications";
import { analyzeParsedBankImport } from "../../src/features/imports/persistence";
import { getMonthCompleteness } from "../../src/features/reporting/monthly-report";
import { getSharedSettlementsPageData } from "../../src/features/shared-settlements/service";
import type { ParsedBankStatement } from "../../src/features/imports/types";

// All fixture writes, including classifications and reporting projections, roll back.
test("merchant rules persist safely, preserve undo, and keep ambiguous attribution pending", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = drizzle(pool, { schema });
  const rollback = new Error("rollback test fixtures");
  try {
    await assert.rejects(db.transaction(async (tx) => {
      const [workspace] = await tx.insert(schema.workspaces).values({ name: "Merchant reuse test", baseCurrency: "ILS" }).returning();
      const users = await tx.insert(schema.users).values(["Alex", "Sam"].map((displayName) => ({ displayName, email: `${randomUUID()}@example.test` }))).returning();
      const members = await tx.insert(schema.workspaceMembers).values(users.map((user) => ({ workspaceId: workspace.id, userId: user.id, role: "member" }))).returning();
      const context = { workspaceId: workspace.id, userId: users[0].id, memberId: members[0].id, baseCurrency: "ILS" };
      const accounts = await tx.insert(schema.financialAccounts).values(members.map((member, index) => ({ workspaceId: workspace.id, ownerMemberId: member.id, accountType: "credit_card" as const, displayName: `Card ${index}` }))).returning();
      const [statement] = await tx.insert(schema.imports).values({ workspaceId: workspace.id, uploadedByUserId: users[0].id, type: "bank", fileKind: "csv", originalFilename: "test.csv", storagePath: "test", fileChecksum: randomUUID(), importStatus: "completed" }).returning();
      const rows = await tx.insert(schema.transactions).values(accounts.map((account) => ({ workspaceId: workspace.id, accountId: account.id, importId: statement.id, transactionDate: "2026-09-01", description: "Gym", merchantRaw: "GYM", originalAmount: "20", workspaceCurrency: "ILS", normalizedAmount: "20", direction: "debit", dedupeHash: randomUUID() }))).returning();
      const personal = { classificationType: "personal" as const, personalOwnerMemberId: members[0].id, paidByMemberId: members[0].id };
      const first = await upsertTransactionClassification(context, { transactionId: rows[0].id, ...personal, createRule: true }, tx);
      const [rule] = await tx.select().from(schema.classificationRules).where(eq(schema.classificationRules.workspaceId, workspace.id));
      assert.equal(rule.defaultPersonalOwnerMemberId, null);
      assert.equal(rule.defaultPaidByMemberId, null);
      assert.equal(rule.defaultMemberOwnerId, null);
      const [classification] = await tx.select().from(schema.transactionClassifications).where(eq(schema.transactionClassifications.transactionId, rows[0].id));
      assert.equal(classification.personalOwnerMemberId, members[0].id);
      const parsed: ParsedBankStatement = { templateId: "max_credit_statement", accountLabel: "A new card", transactions: [{ transactionDate: "2026-09-02", merchantRaw: " gym ", description: "Gym", originalAmount: 20, originalCurrency: "ILS", direction: "debit", sourceSheetName: "Sheet1", sourceRowIndex: 1, rawValues: [] }] };
      const known = await analyzeParsedBankImport({ context, parsed, accountOwnerMemberId: members[1].id, db: tx });
      assert.equal(known.automaticRuleCount, 1);
      const unknown = await analyzeParsedBankImport({ context, parsed, accountOwnerMemberId: null, db: tx });
      assert.equal(unknown.automaticRuleCount, 0);
      const report = await getMonthCompleteness(context, { month: "2026-09" }, tx);
      assert.equal(report.pendingOutflowTotal, 20);
      assert.equal(report.status, "in_progress");
      const settlements = await getSharedSettlementsPageData(context, tx);
      assert.equal(settlements.pendingReviewCount, 1);
      await assert.rejects(upsertTransactionClassification(context, { transactionId: rows[1].id, ...personal, paidByMemberId: members[1].id, createRule: true }, tx), /exception/);
      await undoClassificationDecision(context, first.undoBatchId, tx);
      assert.equal((await tx.select().from(schema.classificationRules).where(eq(schema.classificationRules.workspaceId, workspace.id))).length, 0);
      // A legacy snapshot is not silently reused, and undo preserves it exactly.
      await tx.insert(schema.classificationRules).values({ workspaceId: workspace.id, matchType: "exact", matchValue: "gym", defaultClassificationType: "personal", defaultMemberOwnerId: members[0].id, defaultPersonalOwnerMemberId: members[0].id, defaultPaidByMemberId: members[0].id });
      assert.equal((await analyzeParsedBankImport({ context, parsed, accountOwnerMemberId: members[1].id, db: tx })).automaticRuleCount, 0);
      const replacement = await upsertTransactionClassification(context, { transactionId: rows[0].id, ...personal, createRule: true }, tx);
      await undoClassificationDecision(context, replacement.undoBatchId, tx);
      const [restored] = await tx.select().from(schema.classificationRules).where(eq(schema.classificationRules.workspaceId, workspace.id));
      assert.equal(restored.defaultPaidByMemberId, members[0].id);
      await assert.rejects(stopMerchantRule({ ...context, workspaceId: randomUUID() }, rows[0].id, tx), /no merchant/);
      await stopMerchantRule(context, rows[0].id, tx);
      assert.equal((await tx.select().from(schema.classificationRules).where(eq(schema.classificationRules.id, restored.id)))[0].active, false);
      throw rollback;
    }), (error) => error === rollback);
  } finally { await pool.end(); }
});
