import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";

import * as schema from "../../src/db/schema";
import {
  undoClassificationDecision,
  upsertTransactionClassification,
} from "../../src/features/expenses/classifications";
import { merchantRuleAttribution } from "../../src/features/expenses/merchant-rules";
import { syncTransactionExpenseEvents } from "../../src/features/reporting/expense-events";
import {
  createRecurringEntry,
  generateRecurringEntriesForPeriod,
} from "../../src/features/recurring/service";
import {
  getSharedSettlementsPageData,
  upsertSharedSettlement,
} from "../../src/features/shared-settlements/service";

test("shared split-for-settlement eligibility, undo, and one-member replay", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = drizzle(pool, { schema });
  const rollback = new Error("rollback test fixtures");

  try {
    await assert.rejects(db.transaction(async (tx) => {
      const [workspace] = await tx.insert(schema.workspaces).values({
        name: "Split settlement test",
        baseCurrency: "ILS",
      }).returning();
      const users = await tx.insert(schema.users).values(
        ["Alex", "Sam"].map((displayName) => ({
          displayName,
          email: `${randomUUID()}@example.test`,
        })),
      ).returning();
      const members = await tx.insert(schema.workspaceMembers).values(
        users.map((user) => ({
          workspaceId: workspace.id,
          userId: user.id,
          role: "member" as const,
        })),
      ).returning();
      const context = {
        workspaceId: workspace.id,
        userId: users[0].id,
        memberId: members[0].id,
        baseCurrency: "ILS",
      };
      const accounts = await tx.insert(schema.financialAccounts).values(
        members.map((member, index) => ({
          workspaceId: workspace.id,
          ownerMemberId: member.id,
          accountType: "credit_card" as const,
          displayName: `Card ${index}`,
        })),
      ).returning();
      const [statement] = await tx.insert(schema.imports).values({
        workspaceId: workspace.id,
        uploadedByUserId: users[0].id,
        type: "bank",
        fileKind: "csv",
        originalFilename: "test.csv",
        storagePath: "test",
        fileChecksum: randomUUID(),
        importStatus: "completed",
      }).returning();
      const rows = await tx.insert(schema.transactions).values(
        [
          "Shared rent",
          "Shared dinner",
          "Confirmed dinner",
          "Personal gift",
          "Rule match",
          "Split then personal",
        ].map((merchantRaw) => ({
          workspaceId: workspace.id,
          accountId: accounts[0].id,
          importId: statement.id,
          transactionDate: "2026-09-01",
          description: merchantRaw,
          merchantRaw,
          originalAmount: "20",
          workspaceCurrency: "ILS",
          normalizedAmount: "20",
          direction: "debit" as const,
          dedupeHash: randomUUID(),
        })),
      ).returning();

      const [rent, dinner, confirmed, personal, ruleMatch, retyped] = rows;

      await upsertTransactionClassification(context, {
        transactionId: rent.id,
        classificationType: "shared",
        paidByMemberId: members[0].id,
        splitForSettlement: false,
      }, tx);

      let settlements = await getSharedSettlementsPageData(context, tx);
      assert.equal(settlements.needsSplitSetup.length, 0);
      assert.equal(settlements.trackedExpenses.length, 0);
      assert.equal(
        (await tx.select().from(schema.sharedExpenseSplits)).length,
        0,
      );

      await upsertTransactionClassification(context, {
        transactionId: dinner.id,
        classificationType: "shared",
        paidByMemberId: members[0].id,
        splitForSettlement: true,
      }, tx);

      settlements = await getSharedSettlementsPageData(context, tx);
      assert.equal(settlements.needsSplitSetup.map((item) => item.sourceId).join(), dinner.id);
      assert.equal(settlements.trackedExpenses.length, 0);
      assert.equal(
        (await tx.select().from(schema.sharedExpenseSplits)).length,
        0,
      );

      await upsertTransactionClassification(context, {
        transactionId: confirmed.id,
        classificationType: "shared",
        paidByMemberId: members[0].id,
        splitForSettlement: true,
      }, tx);
      const [confirmedEvent] = await tx.select().from(schema.expenseEvents)
        .where(eq(schema.expenseEvents.sourceId, confirmed.id));
      await upsertSharedSettlement(context, {
        expenseEventId: confirmedEvent.id,
        payerMemberId: members[0].id,
        splitMode: "equal",
        splitDefinition: { participants: [members[0].id, members[1].id] },
        settlementStatus: "open",
      }, tx);

      settlements = await getSharedSettlementsPageData(context, tx);
      assert.equal(settlements.trackedExpenses.some((item) => item.sourceId === confirmed.id), true);
      const [confirmedSplit] = await tx.select().from(schema.sharedExpenseSplits)
        .where(eq(schema.sharedExpenseSplits.expenseEventId, confirmedEvent.id));
      assert.equal(confirmedSplit.splitMode, "equal");
      assert.equal(confirmedSplit.settlementStatus, "open");

      const hideSplit = await upsertTransactionClassification(context, {
        transactionId: confirmed.id,
        classificationType: "shared",
        paidByMemberId: members[0].id,
        splitForSettlement: false,
      }, tx);
      settlements = await getSharedSettlementsPageData(context, tx);
      assert.equal(settlements.trackedExpenses.some((item) => item.sourceId === confirmed.id), false);
      assert.equal(settlements.needsSplitSetup.some((item) => item.sourceId === confirmed.id), false);
      const [keptSplit] = await tx.select().from(schema.sharedExpenseSplits)
        .where(eq(schema.sharedExpenseSplits.expenseEventId, confirmedEvent.id));
      assert.equal(keptSplit.splitMode, "equal");
      assert.equal(keptSplit.settlementStatus, "open");

      await undoClassificationDecision(context, hideSplit.undoBatchId, tx);
      const [restoredClassification] = await tx.select().from(schema.transactionClassifications)
        .where(eq(schema.transactionClassifications.transactionId, confirmed.id));
      assert.equal(restoredClassification.splitForSettlement, true);
      const [restoredEvent] = await tx.select().from(schema.expenseEvents)
        .where(eq(schema.expenseEvents.sourceId, confirmed.id));
      const [restoredSplit] = await tx.select().from(schema.sharedExpenseSplits)
        .where(eq(schema.sharedExpenseSplits.expenseEventId, restoredEvent.id));
      assert.equal(restoredSplit.splitMode, "equal");
      assert.equal(restoredSplit.settlementStatus, "open");
      settlements = await getSharedSettlementsPageData(context, tx);
      assert.equal(settlements.trackedExpenses.some((item) => item.sourceId === confirmed.id), true);

      await upsertTransactionClassification(context, {
        transactionId: retyped.id,
        classificationType: "shared",
        paidByMemberId: members[0].id,
        splitForSettlement: true,
      }, tx);
      const [retypedEvent] = await tx.select().from(schema.expenseEvents)
        .where(eq(schema.expenseEvents.sourceId, retyped.id));
      await upsertSharedSettlement(context, {
        expenseEventId: retypedEvent.id,
        payerMemberId: members[0].id,
        splitMode: "equal",
        splitDefinition: { participants: [members[0].id, members[1].id] },
        settlementStatus: "open",
      }, tx);
      const toPersonal = await upsertTransactionClassification(context, {
        transactionId: retyped.id,
        classificationType: "personal",
        personalOwnerMemberId: members[0].id,
        paidByMemberId: members[0].id,
      }, tx);
      assert.equal(
        (await tx.select().from(schema.sharedExpenseSplits)
          .where(eq(schema.sharedExpenseSplits.expenseEventId, retypedEvent.id))).length,
        0,
      );

      await undoClassificationDecision(context, toPersonal.undoBatchId, tx);
      const [personalUndoEvent] = await tx.select().from(schema.expenseEvents)
        .where(eq(schema.expenseEvents.sourceId, retyped.id));
      const [personalUndoSplit] = await tx.select().from(schema.sharedExpenseSplits)
        .where(eq(schema.sharedExpenseSplits.expenseEventId, personalUndoEvent.id));
      assert.equal(personalUndoSplit.splitMode, "equal");
      assert.equal(personalUndoSplit.settlementStatus, "open");

      await upsertTransactionClassification(context, {
        transactionId: personal.id,
        classificationType: "personal",
        personalOwnerMemberId: members[1].id,
        paidByMemberId: members[0].id,
      }, tx);
      settlements = await getSharedSettlementsPageData(context, tx);
      assert.equal(settlements.needsSplitSetup.some((item) => item.sourceId === personal.id), false);
      assert.equal(settlements.trackedExpenses.some((item) => item.sourceId === personal.id), false);

      await tx.insert(schema.classificationRules).values({
        workspaceId: workspace.id,
        matchType: "exact",
        matchValue: "rule match",
        defaultClassificationType: "shared",
        defaultSplitForSettlement: true,
      });
      const ruleAttribution = merchantRuleAttribution("shared", members[0].id);
      await tx.insert(schema.transactionClassifications).values({
        transactionId: ruleMatch.id,
        classificationType: "shared",
        memberOwnerId: members[0].id,
        personalOwnerMemberId: ruleAttribution.personalOwnerMemberId,
        paidByMemberId: ruleAttribution.paidByMemberId,
        receivedByMemberId: ruleAttribution.receivedByMemberId,
        splitForSettlement: true,
        decidedBy: "rule",
      });
      await syncTransactionExpenseEvents(context, [ruleMatch.id], tx);
      settlements = await getSharedSettlementsPageData(context, tx);
      assert.equal(settlements.needsSplitSetup.some((item) => item.sourceId === ruleMatch.id), true);
      assert.equal(settlements.trackedExpenses.some((item) => item.sourceId === ruleMatch.id), false);
      const [ruleEvent] = await tx.select().from(schema.expenseEvents)
        .where(eq(schema.expenseEvents.sourceId, ruleMatch.id));
      assert.equal(
        (await tx.select().from(schema.sharedExpenseSplits)
          .where(eq(schema.sharedExpenseSplits.expenseEventId, ruleEvent.id))).length,
        0,
      );

      const recurring = await createRecurringEntry(context, {
        title: "Stored split rent",
        eventKind: "expense",
        classificationType: "shared",
        payerMemberId: members[0].id,
        splitForSettlement: true,
        effectiveStartMonth: "2026-09",
        amount: 15,
        currency: "ILS",
        normalizationMode: "none",
        recurrenceRule: "monthly",
      }, tx);

      await tx.update(schema.workspaceMembers)
        .set({ isActive: false })
        .where(eq(schema.workspaceMembers.id, members[1].id));

      const [stillSplit] = await tx.select().from(schema.transactionClassifications)
        .where(eq(schema.transactionClassifications.transactionId, confirmed.id));
      assert.equal(stillSplit.splitForSettlement, true);
      assert.ok((await tx.select().from(schema.sharedExpenseSplits)).length > 0);

      settlements = await getSharedSettlementsPageData(context, tx);
      assert.equal(settlements.isPairwiseReady, false);
      assert.equal(settlements.needsSplitSetup.length, 0);

      await assert.rejects(
        upsertTransactionClassification(context, {
          transactionId: rent.id,
          classificationType: "shared",
          paidByMemberId: members[0].id,
          splitForSettlement: true,
        }, tx),
        /two active members/,
      );

      await generateRecurringEntriesForPeriod(context, {
        startMonth: "2026-09",
        endMonth: "2026-09",
      }, tx);
      const [generated] = await tx.select().from(schema.manualEntries)
        .where(eq(schema.manualEntries.sourceId, recurring.id));
      assert.equal(generated.splitForSettlement, true);

      throw rollback;
    }), (error) => error === rollback);
  } finally {
    await pool.end();
  }
});
