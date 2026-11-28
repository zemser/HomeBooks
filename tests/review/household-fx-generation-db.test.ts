import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../../src/db/schema";
import { previousMonthFromTransactionDate } from "../../src/features/currency/monthly-rates";
import { analyzeParsedBankImport } from "../../src/features/imports/persistence";
import { transactionIdentity } from "../../src/features/imports/identity";
import type { ParsedBankStatement } from "../../src/features/imports/types";
import {
  createRecurringEntry,
  materializeRecurringEntriesForRange,
} from "../../src/features/recurring/service";
import { currentMonthString } from "../../src/features/recurring/utils";

test(
  "recurring snapshots survive revised rates and Max legacy keys match overlapping exports",
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async () => {
    const pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const db = drizzle(pool, { schema });
    const rollback = new Error("rollback");
    try {
      await assert.rejects(
        db.transaction(async (tx) => {
          const workspaceId = randomUUID(),
            memberId = randomUUID(),
            userId = randomUUID();
          const context = {
            workspaceId,
            memberId,
            userId,
            baseCurrency: "ILS",
            fxPolicy: "previous-month-v1" as const,
          };
          await tx
            .insert(schema.workspaces)
            .values({
              id: workspaceId,
              name: "FX fixture",
              baseCurrency: "ILS",
              fxPolicy: context.fxPolicy,
            });
          await tx
            .insert(schema.users)
            .values({
              id: userId,
              displayName: "Test",
              email: userId + "@example.test",
            });
          await tx
            .insert(schema.workspaceMembers)
            .values({ id: memberId, workspaceId, userId, role: "owner" });
          const month = currentMonthString();
          const quote = {
            baseCurrency: "USD",
            quoteCurrency: "ILS",
            yearMonth: previousMonthFromTransactionDate(month),
            averageRate: "3.088",
            sourceName: "boi-monthly-v1:" + randomUUID(),
            fetchedAt: new Date("2200-01-01"),
          };
          const [applied] = await tx
            .insert(schema.exchangeRateMonthly)
            .values(quote)
            .returning();
          const entry = await createRecurringEntry(
            context,
            {
              title: "Rent",
              eventKind: "expense",
              classificationType: "shared",
              effectiveStartMonth: month,
              amount: 100,
              currency: "USD",
              normalizationMode: "monthly_average",
              recurrenceRule: "monthly",
            },
            tx,
          );
          const occurrence = async () =>
            (
              await tx
                .select()
                .from(schema.manualEntries)
                .where(eq(schema.manualEntries.sourceId, entry.id))
            )[0];
          const before = await occurrence();
          assert.equal(before.normalizedAmount, "308.800000");
          assert.equal(before.exchangeRateId, applied.id);
          assert.equal(before.valuationState, "converted");
          await tx
            .insert(schema.exchangeRateMonthly)
            .values({
              ...quote,
              averageRate: "3.2",
              sourceName: "boi-monthly-v1:" + randomUUID(),
              fetchedAt: new Date("2201-01-01"),
            });
          assert.equal(
            (
              await materializeRecurringEntriesForRange(
                context,
                { startMonth: month, endMonth: month },
                tx,
              )
            ).updatedCount,
            0,
          );
          assert.deepEqual(await occurrence(), before);

          // A one-off amount correction carries its own applied rate and projection.
          await tx.update(schema.manualEntries).set({
            category: "Housing",
            originalAmount: "60",
            normalizedAmount: "185.28",
          }).where(eq(schema.manualEntries.id, before.id));
          await tx.insert(schema.manualEntryOverrides).values([{
            manualEntryId: before.id,
            overrideType: "amount",
            oldValueJson: { amount: "100" },
            newValueJson: { amount: "60" },
          }, {
            manualEntryId: before.id,
            overrideType: "category",
            newValueJson: { category: "Housing" },
          }]);
          await tx.update(schema.manualRecurringExpenses).set({
            title: "Updated rent",
          }).where(eq(schema.manualRecurringExpenses.id, entry.id));
          const regenerate = () => materializeRecurringEntriesForRange(
            context, { startMonth: month, endMonth: month }, tx,
          );
          assert.equal((await regenerate()).updatedCount, 1);
          const corrected = await occurrence();
          assert.equal(corrected.title, "Updated rent");
          assert.equal(corrected.category, "Housing");
          assert.equal(corrected.originalAmount, "60.000000");
          assert.equal(corrected.normalizedAmount, "185.280000");
          assert.equal(corrected.normalizationRate, before.normalizationRate);
          assert.equal(corrected.exchangeRateId, applied.id);
          assert.equal(corrected.valuationPolicy, before.valuationPolicy);
          assert.equal(corrected.referenceMonth, before.referenceMonth);
          const [event] = await tx.select().from(schema.expenseEvents)
            .where(eq(schema.expenseEvents.sourceId, before.id));
          assert.equal(event.totalAmount, "185.280000");
          const [allocation] = await tx.select().from(schema.expenseAllocations)
            .where(eq(schema.expenseAllocations.expenseEventId, event.id));
          assert.equal(allocation.allocatedAmount, "185.280000");
          assert.equal((await regenerate()).updatedCount, 0);

          const accountLabel = "Card 1001";
          const transaction = {
            transactionDate: month,
            description: "Cursor",
            merchantRaw: "Cursor",
            originalAmount: 20,
            originalCurrency: null,
            settlementAmount: 62.05,
            settlementCurrency: "ILS",
            direction: "debit" as const,
            sourceSheetName: "sheet",
            sourceRowIndex: 5,
            rawValues: [],
          };
          const parsed: ParsedBankStatement = {
            templateId: "max_credit_statement",
            accountLabel,
            transactions: [transaction],
          };
          const analyze = () =>
            analyzeParsedBankImport({ context, parsed, db: tx });
          const plan = await analyze();
          assert.equal(plan.newTransactionCount, 1);
          const sourceId = plan.templateRecord.sourceId;
          const [account] = await tx
            .insert(schema.financialAccounts)
            .values({
              workspaceId,
              accountType: "credit_card",
              displayName: accountLabel,
              externalAccountLabel: accountLabel,
              importSourceId: sourceId,
            })
            .returning();
          const [firstImport] = await tx
            .insert(schema.imports)
            .values({
              workspaceId,
              uploadedByUserId: userId,
              type: "bank",
              fileKind: "xlsx",
              originalFilename: "first.xlsx",
              fileChecksum: randomUUID(),
              storagePath: "test",
              importStatus: "completed",
            })
            .returning();
          const legacy = transactionIdentity(
            { workspaceId, sourceId, accountLabel, transaction },
            parsed.templateId,
          ).aliases[0];
          await tx
            .insert(schema.transactions)
            .values({
              workspaceId,
              accountId: account.id,
              importId: firstImport.id,
              transactionDate: month,
              description: "Cursor",
              merchantRaw: "Cursor",
              originalAmount: "20",
              settlementCurrency: "ILS",
              settlementAmount: "62.05",
              workspaceCurrency: "ILS",
              normalizedAmount: "62.05",
              direction: "debit",
              dedupeHash: legacy,
            });
          parsed.transactions = [{ ...transaction, originalCurrency: "USD" }];
          assert.equal((await analyze()).duplicateTransactionCount, 1);
          parsed.transactions.push({
            ...parsed.transactions[0],
            sourceRowIndex: 6,
          });
          const ambiguous = await analyze();
          assert.equal(ambiguous.duplicateTransactionCount, 0);
          assert.equal(ambiguous.ambiguousRows.length, 2);
          throw rollback;
        }),
        (error) => error === rollback,
      );
    } finally {
      await pool.end();
    }
  },
);
