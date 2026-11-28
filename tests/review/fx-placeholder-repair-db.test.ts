import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";

import * as schema from "../../src/db/schema";
import { backfillImportedFxForWorkspace } from "../../src/features/currency/backfill-imported-fx";
import { getCurrencyNormalizationDisplayState } from "../../src/features/currency/display";
import { upsertTransactionClassification } from "../../src/features/expenses/classifications";
import { analyzeParsedBankImport } from "../../src/features/imports/persistence";
import { parseBankWorkbookWithMonthlyRates } from "../../src/features/imports/parse-bank-workbook";
import type { WorkbookData } from "../../src/features/imports/types";
import { getMonthlyReport } from "../../src/features/reporting/monthly-report";
import { upsertSharedSettlement } from "../../src/features/shared-settlements/service";

const MAX_HEADER = [
  "תאריך\nעסקה",
  "שם בית עסק",
  "סכום\nעסקה",
  "סכום\nחיוב",
  "סוג\nעסקה",
  "ענף",
  "הערות",
];

function maxWorkbook(rows: Array<Array<string | number>>): WorkbookData {
  return {
    fileKind: "xlsx",
    filename: "max.xlsx",
    sheets: [
      {
        name: "Sheet1",
        rows: [["Visa 9556"], [], ["פירוט חיובים"], MAX_HEADER, ...rows],
      },
    ],
  };
}

const USD_SECTION = ["עסקאות שחויבו בדולר", "", "", "", "", "", ""];

/**
 * Regression test for the FX repair + dedupe lifecycle (PR #164 review):
 * a USD charge is imported before its month's rate exists, classified, the
 * rate is published, overlapping statements are imported, and the repair must
 * leave exactly one transaction whose currencies and saved split survive,
 * with the report using the corrected amount and a second repair writing
 * nothing.
 *
 * Deliberately mirrors the app's save path without calling persistBankImport:
 * that function opens its own database transaction, so it cannot run inside
 * this test's rollback transaction. The parse, dedupe analysis, insert,
 * backfill, event sync, and report steps below are the same ones it runs.
 */
test("placeholder FX charge survives rate publish, overlapping import, and repair", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = drizzle(pool, { schema });
  const rollback = new Error("rollback test fixtures");

  try {
    await assert.rejects(db.transaction(async (tx) => {
      const [workspace] = await tx.insert(schema.workspaces).values({
        name: "FX repair test",
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
      const [account] = await tx.insert(schema.financialAccounts).values({
        workspaceId: workspace.id,
        ownerMemberId: members[0].id,
        accountType: "credit_card" as const,
        displayName: "Card 0",
      }).returning();
      const [statement] = await tx.insert(schema.imports).values({
        workspaceId: workspace.id,
        uploadedByUserId: users[0].id,
        type: "bank",
        fileKind: "xlsx",
        originalFilename: "nov-2026.xlsx",
        storagePath: "test",
        fileChecksum: randomUUID(),
        importStatus: "completed",
      }).returning();

      // October's rate exists; November's does not yet.
      await tx.insert(schema.exchangeRateMonthly).values({
        baseCurrency: "USD",
        quoteCurrency: "ILS",
        yearMonth: "2026-10-01",
        averageRate: "3.088",
        sourceName: "seed-boi-monthly-average",
      }).onConflictDoNothing();

      async function importWorkbook(rows: Array<Array<string | number>>) {
        const preview = await parseBankWorkbookWithMonthlyRates({
          workbook: maxWorkbook(rows),
          workspaceCurrency: "ILS",
          db: tx,
        });
        const plan = await analyzeParsedBankImport({
          context,
          parsed: preview.parsed,
          accountOwnerMemberId: members[0].id,
          db: tx,
        });
        const inserted: Array<{ id: string }> = [];
        for (const item of plan.transactionPlans) {
          if (item.duplicate) continue;
          const normalizedPreview = preview.previewTransactions[item.index];
          const [row] = await tx.insert(schema.transactions).values({
            workspaceId: workspace.id,
            accountId: account.id,
            importId: statement.id,
            transactionDate: item.transaction.transactionDate,
            bookingDate: item.transaction.bookingDate ?? null,
            statementSection: item.transaction.statementSection ?? null,
            description: item.transaction.description,
            merchantRaw: item.transaction.merchantRaw,
            originalCurrency: item.transaction.originalCurrency,
            originalAmount: item.transaction.originalAmount.toFixed(6),
            settlementCurrency: item.transaction.settlementCurrency ?? null,
            settlementAmount:
              item.transaction.settlementAmount !== undefined
                ? item.transaction.settlementAmount.toFixed(6)
                : null,
            workspaceCurrency: normalizedPreview.workspaceCurrency,
            normalizedAmount: normalizedPreview.normalizedAmount.toFixed(6),
            normalizationRate: normalizedPreview.normalizationRate.toFixed(8),
            normalizationRateSource: normalizedPreview.normalizationRateSource,
            direction: item.transaction.direction,
            externalReference: null,
            dedupeHash: item.dedupeHash,
          }).returning({ id: schema.transactions.id });
          inserted.push(row);
        }
        return { preview, plan, inserted };
      }

      // 1. Import the November charge before November's rate exists.
      const first = await importWorkbook([
        USD_SECTION,
        ["15-11-2026", "SOME NY STORE", 100, 100, "", "", ""],
      ]);
      assert.equal(first.plan.newTransactionCount, 1);
      assert.equal(first.plan.duplicateTransactionCount, 0);
      const [charge] = first.inserted;
      const [imported] = await tx.select().from(schema.transactions)
        .where(eq(schema.transactions.id, charge.id));
      assert.equal(imported.originalCurrency, "USD");
      assert.equal(imported.settlementCurrency, "USD");
      assert.equal(Number(imported.normalizedAmount), 0);
      assert.equal(imported.normalizationRateSource, "missing-monthly-rate");
      assert.equal(
        getCurrencyNormalizationDisplayState(first.preview.previewTransactions[0]).label,
        "Placeholder FX",
      );

      // 2. Classify it as shared. No expense event exists yet, so the split
      // cannot be saved until the rate is published and the repair runs.
      await upsertTransactionClassification(context, {
        transactionId: charge.id,
        classificationType: "shared",
        paidByMemberId: members[0].id,
        splitForSettlement: true,
      }, tx);
      const [classification] = await tx.select().from(schema.transactionClassifications)
        .where(eq(schema.transactionClassifications.transactionId, charge.id));
      assert.equal(classification.splitForSettlement, true);
      assert.equal(
        (await tx.select().from(schema.expenseEvents)
          .where(eq(schema.expenseEvents.sourceId, charge.id))).length,
        0,
      );
      await assert.rejects(
        upsertSharedSettlement(context, {
          expenseEventId: randomUUID(),
          payerMemberId: members[0].id,
          splitMode: "equal",
          splitDefinition: { participants: [members[0].id, members[1].id] },
          settlementStatus: "open",
        }, tx),
        /not found/,
      );

      // 3. Publish November's rate.
      await tx.insert(schema.exchangeRateMonthly).values({
        baseCurrency: "USD",
        quoteCurrency: "ILS",
        yearMonth: "2026-11-01",
        averageRate: "3.12",
        sourceName: "seed-boi-monthly-average",
      }).onConflictDoNothing();

      // 4. Import an overlapping statement: the same charge plus a new one.
      // The repeat must be detected as a duplicate, not inserted again.
      const second = await importWorkbook([
        USD_SECTION,
        ["15-11-2026", "SOME NY STORE", 100, 100, "", "", ""],
        ["20-11-2026", "ANOTHER NY STORE", 50, 50, "", "", ""],
      ]);
      assert.equal(second.plan.newTransactionCount, 1);
      assert.equal(second.plan.duplicateTransactionCount, 1);
      const allCharges = await tx.select().from(schema.transactions)
        .where(eq(schema.transactions.workspaceId, workspace.id));
      assert.equal(allCharges.length, 2);
      assert.equal(
        allCharges.filter((row) => row.merchantRaw === "SOME NY STORE").length,
        1,
      );

      // 5. Repair: only the placeholder row changes, to the published rate.
      const repair = await backfillImportedFxForWorkspace(context, tx);
      assert.equal(repair.updatedCount, 1);
      const [repaired] = await tx.select().from(schema.transactions)
        .where(eq(schema.transactions.id, charge.id));
      assert.equal(repaired.originalCurrency, "USD");
      assert.equal(repaired.settlementCurrency, "USD");
      assert.equal(Number(repaired.normalizedAmount), 312);
      assert.equal(Number(repaired.normalizationRate), 3.12);
      assert.equal(
        repaired.normalizationRateSource,
        "exchange-rate-monthly:seed-boi-monthly-average",
      );
      const [event] = await tx.select().from(schema.expenseEvents)
        .where(eq(schema.expenseEvents.sourceId, charge.id));
      assert.equal(Number(event.totalAmount), 312);

      // 6. Now the split can be saved, on the repaired event.
      await upsertSharedSettlement(context, {
        expenseEventId: event.id,
        payerMemberId: members[0].id,
        splitMode: "equal",
        splitDefinition: { participants: [members[0].id, members[1].id] },
        settlementStatus: "open",
      }, tx);
      const [split] = await tx.select().from(schema.sharedExpenseSplits)
        .where(eq(schema.sharedExpenseSplits.expenseEventId, event.id));
      assert.equal(split.splitMode, "equal");
      assert.equal(split.settlementStatus, "open");

      // 7. The November report uses the corrected amount.
      const report = await getMonthlyReport(context, { month: "2026-11", mode: "payment_date" }, tx);
      assert.equal(report.summary.expenseTotal, 312);
      const lineItem = report.lineItems.find((item) => item.sourceRecordId === charge.id);
      assert.ok(lineItem);
      assert.equal(lineItem.normalizedAmount, 312);
      assert.equal(lineItem.sourceNormalizedAmount, 312);

      // 8. A second repair writes nothing, and the split survives it.
      const secondRepair = await backfillImportedFxForWorkspace(context, tx);
      assert.equal(secondRepair.updatedCount, 0);
      const [stillRepaired] = await tx.select().from(schema.transactions)
        .where(eq(schema.transactions.id, charge.id));
      assert.equal(Number(stillRepaired.normalizedAmount), 312);
      const [stillEvent] = await tx.select().from(schema.expenseEvents)
        .where(eq(schema.expenseEvents.sourceId, charge.id));
      assert.equal(Number(stillEvent.totalAmount), 312);
      assert.equal(
        (await tx.select().from(schema.sharedExpenseSplits)
          .where(eq(schema.sharedExpenseSplits.expenseEventId, event.id))).length,
        1,
      );

      throw rollback;
    }), (error) => error === rollback);
  } finally {
    await pool.end();
  }
});
