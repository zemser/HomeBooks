import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../../src/db/schema";
import { reconcilePendingFxForWorkspace } from "../../src/features/currency/backfill-imported-fx";
import { drainFxRateRequests } from "../../src/features/currency/rate-worker";
import { upsertTransactionClassification } from "../../src/features/expenses/classifications";
import {
  analyzeParsedBankImport,
  persistBankImport,
} from "../../src/features/imports/persistence";
import { parseBankWorkbookToPreview } from "../../src/features/imports/parse-bank-workbook";
import type { WorkbookData } from "../../src/features/imports/types";
import {
  getYearExportTable,
  serializeExportTableCsv,
} from "../../src/features/reporting/export";
import {
  getMonthlyReport,
  loadYearReportSource,
} from "../../src/features/reporting/monthly-report";
import {
  getSharedSettlementsPageData,
  upsertSharedSettlement,
} from "../../src/features/shared-settlements/service";

test(
  "a classified pending statement survives publication, overlapping imports and settlement",
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async () => {
    const pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const db = drizzle(pool, { schema });
    const workspaceId = randomUUID();
    const rollback = new Error("rollback lifecycle fixtures");
    const originalStorage = process.env.FINAPP_IMPORT_STORAGE;
    process.env.FINAPP_IMPORT_STORAGE = "local";
    try {
      await assert.rejects(
        db.transaction(async (tx) => {
          // All queue and rate changes, including provider failure and retry, roll back.
          // Keep unrelated requests outside this worker batch for a deterministic fixture.
          await tx.execute(
            sql`update public.fx_rate_requests set available_at = 'infinity'`,
          );
          await tx.execute(
            sql`delete from public.fx_rate_requests where base_currency='USD' and year_month='2001-10-01'`,
          );
          await tx.execute(
            sql`delete from public.exchange_rate_monthly where base_currency='USD' and quote_currency='ILS' and year_month='2001-10-01'`,
          );
          await tx.insert(schema.workspaces).values({
            id: workspaceId,
            name: "FX lifecycle",
            baseCurrency: "ILS",
            fxPolicy: "previous-month-v1",
          });
          const users = await tx
            .insert(schema.users)
            .values(
              ["Alex", "Blair"].map((displayName) => ({
                displayName,
                email: randomUUID() + "@example.test",
              })),
            )
            .returning();
          const [payer, partner] = await tx
            .insert(schema.workspaceMembers)
            .values(
              users.map((user) => ({
                workspaceId,
                userId: user.id,
                role: "owner",
              })),
            )
            .returning();
          const context = {
            workspaceId,
            memberId: payer.id,
            userId: payer.userId,
            baseCurrency: "ILS",
            fxPolicy: "previous-month-v1" as const,
          };
          const month = "2001-11-01";
          const workbook: WorkbookData = {
            fileKind: "xlsx",
            filename: "one.xlsx",
            sheets: [
              {
                name: "Transactions",
                rows: [
                  ["Card 9556"],
                  [],
                  ["November"],
                  [
                    "תאריך\nעסקה",
                    "שם בית עסק",
                    "סכום\nעסקה",
                    "סכום\nחיוב",
                    "סוג\nעסקה",
                    "ענף",
                    "הערות",
                  ],
                  ["עסקאות שחויבו בדולר"],
                  ["22-11-2001", "DINNER", 100, 100, "", "", ""],
                ],
              },
            ],
          };
          const save = (
            file: string,
            rowDecisions?: Record<string, "keep" | "skip">,
          ) =>
            persistBankImport(
              {
                rowDecisions,
                workbook,
                originalFilename: file + ".xlsx",
                fileBuffer: Buffer.from(file),
                accountOwnerMemberId: payer.id,
                context,
              },
              (_user, callback) => callback(tx),
            );
          const report = () => getMonthlyReport(context, { month }, tx);
          const exportSummary = async () => {
            const source = await loadYearReportSource(
              context,
              { throughMonth: month },
              tx,
            );
            const table = getYearExportTable(source, "year_summary");
            return {
              row: table.rows.find((row) =>
                String(row.month).startsWith("2001-11"),
              )!,
              csv: serializeExportTableCsv(table).toString("utf8"),
            };
          };
          assert.equal((await save("original")).transactionCount, 1);
          const transactions = () =>
            tx
              .select()
              .from(schema.transactions)
              .where(eq(schema.transactions.workspaceId, workspaceId));
          const [pending] = await transactions();
          assert.equal(pending.valuationState, "pending");
          await upsertTransactionClassification(
            context,
            {
              transactionId: pending.id,
              classificationType: "shared",
              paidByMemberId: payer.id,
              splitForSettlement: true,
            },
            tx,
          );
          const before = await report();
          assert.equal(before.summary.expenseTotal, 0);
          assert.equal(before.completeness.pendingFx?.[0]?.currency, "USD");
          assert.equal(Number(before.completeness.pendingFx?.[0]?.amount), 100);
          const pendingExport = await exportSummary();
          assert.equal(pendingExport.row.total_spent, 0);
          assert.match(
            pendingExport.csv,
            /USD 100(?:\.0+)? awaiting conversion/,
          );
          const pendingSettlements = await getSharedSettlementsPageData(
            context,
            tx,
          );
          assert.equal(pendingSettlements.needsSplitSetup.length, 0);

          let online = false;
          let writes = 0;
          const drain = () =>
            drainFxRateRequests(tx, {
              fetchRates: async (baseCurrency, months) => {
                if (!online) throw new Error("fixture provider offline");
                assert.deepEqual(months, ["2001-10-01"]);
                return [
                  {
                    baseCurrency,
                    quoteCurrency: "ILS",
                    yearMonth: months[0],
                    averageRate: "3.08800000",
                    seriesCode: "RER_USD_ILS",
                    observationCount: 21,
                    provider: "BOI",
                    calculationVersion: "fixture",
                    sourceName: "boi-monthly-v1:fixture",
                  },
                ];
              },
              repairPage: async (household, key, cursor) => {
                const result = await reconcilePendingFxForWorkspace(household, tx, key, cursor);
                writes += result.updatedCount;
                return result;
              },
            });
          assert.equal((await drain()).repaired, 0);
          assert.equal((await transactions())[0].valuationState, "pending");
          online = true;
          await tx.execute(
            sql`update public.fx_rate_requests set available_at=now() where base_currency='USD' and year_month='2001-10-01'`,
          );
          assert.equal((await drain()).repaired, 1);
          assert.equal(writes, 1);
          assert.equal(
            (await save("overlapping")).duplicateTransactionCount,
            1,
          );
          const valued = await transactions();
          assert.equal(valued.length, 1);
          assert.equal(valued[0].id, pending.id);
          assert.equal(valued[0].normalizedAmount, "308.800000");
          assert.equal(valued[0].referenceMonth, "2001-10-01");
          const after = await report();
          assert.equal(after.summary.expenseTotal, 308.8);
          assert.deepEqual(after.completeness.pendingFx, []);
          const valuedExport = await exportSummary();
          assert.equal(valuedExport.row.total_spent, 308.8);
          assert.doesNotMatch(valuedExport.csv, /awaiting conversion/i);
          const [event] = await tx
            .select()
            .from(schema.expenseEvents)
            .where(eq(schema.expenseEvents.sourceId, pending.id));
          await upsertSharedSettlement(
            context,
            {
              expenseEventId: event.id,
              payerMemberId: payer.id,
              splitMode: "equal",
              splitDefinition: { participants: [payer.id, partner.id] },
              settlementStatus: "settled",
            },
            tx,
          );
          const split = () =>
            tx
              .select()
              .from(schema.sharedExpenseSplits)
              .where(eq(schema.sharedExpenseSplits.expenseEventId, event.id));
          const snapshot = await split();
          const tracked = (await getSharedSettlementsPageData(context, tx))
            .trackedExpenses[0];
          assert.deepEqual(
            tracked.shareBreakdown.map((share) => Number(share.amount)),
            [154.4, 154.4],
          );
          assert.equal(tracked.splitState?.settlementStatus, "settled");
          assert.equal((await drain()).claimed, 0);
          assert.equal(
            (await reconcilePendingFxForWorkspace(context, tx)).updatedCount,
            0,
          );
          assert.deepEqual(await split(), snapshot);
          assert.deepEqual(await transactions(), valued);
          workbook.sheets[0].rows.push(
            ["23-11-2001", "COFFEE", 7, 7],
            ["23-11-2001", "COFFEE", 7, 7],
          );
          async function review(file: string) {
            const { parsed } = parseBankWorkbookToPreview({
              workbook,
              workspaceCurrency: "ILS",
            });
            const plan = await analyzeParsedBankImport({
              context,
              parsed,
              db: tx,
              fileChecksum: createHash("sha256").update(file).digest("hex"),
            });
            assert.equal(plan.ambiguousRows.length, 2);
            return plan.ambiguousRows.map((row) => row.key);
          }
          const keepBoth = Object.fromEntries(
            (await review("two coffees")).map((key) => [key, "keep" as const]),
          );
          const staleDecisions = Object.fromEntries(
            (await review("second export")).map((key) => [
              key,
              "keep" as const,
            ]),
          );
          assert.equal(
            (await save("two coffees", keepBoth)).transactionCount,
            2,
          );
          await assert.rejects(
            save("second export", staleDecisions),
            /review/i,
          );
          const skipBoth = Object.fromEntries(
            (await review("second export")).map((key) => [
              key,
              "skip" as const,
            ]),
          );
          assert.equal(
            (await save("second export", skipBoth)).transactionCount,
            0,
          );
          const coffees = (await transactions()).filter(
            (row) => row.merchantRaw === "COFFEE",
          );
          assert.equal(coffees.length, 2);
          assert.equal(new Set(coffees.map((row) => row.dedupeHash)).size, 2);
          // Cal sheet names are arbitrary, including names that resemble Max currency sections.
          // Both identical purchases were explicitly accepted before their rate was available.
          workbook.sheets = [
            {
              name: "Transactions אירו",
              rows: [
                [],
                ["Cal card"],
                ["November"],
                [
                  "תאריך עסקה",
                  "שם בית העסק",
                  "קטגוריה",
                  "4 ספרות אחרונות של כרטיס האשראי",
                  "סוג עסקה",
                  "סכום חיוב",
                ],
                ...Array.from({ length: 2 }, () => [
                  "23-11-2001",
                  "CAL COFFEE",
                  "",
                  "1234",
                  "",
                  7,
                  "GBP",
                  7,
                  "GBP",
                ]),
              ],
            },
          ];
          await tx.execute(
            sql`delete from exchange_rate_monthly where base_currency='GBP' and quote_currency='ILS' and year_month='2001-10-01'`,
          );
          const decisions = Object.fromEntries(
            (await review("cal twins")).map((key) => [key, "keep" as const]),
          );
          assert.equal(
            (await save("cal twins", decisions)).transactionCount,
            2,
          );
          const calRows = (await transactions()).filter(
            (row) => row.merchantRaw === "CAL COFFEE",
          );
          assert.equal(calRows.length, 2);
          for (const row of calRows) {
            assert.equal(row.valuationState, "pending");
            await upsertTransactionClassification(
              context,
              {
                transactionId: row.id,
                classificationType: "shared",
                paidByMemberId: payer.id,
              },
              tx,
            );
          }
          await tx
            .insert(schema.exchangeRateMonthly)
            .values({
              baseCurrency: "GBP",
              quoteCurrency: "ILS",
              averageRate: "3.5",
              yearMonth: "2001-10-01",
              sourceName: "boi-monthly-v1:cal-fixture",
            });
          const calKey = {
            baseCurrency: "GBP",
            quoteCurrency: "ILS",
            yearMonth: "2001-10-01",
          };
          assert.equal(
            (await reconcilePendingFxForWorkspace(context, tx, calKey))
              .updatedCount,
            2,
          );
          assert.equal(
            (await reconcilePendingFxForWorkspace(context, tx, calKey))
              .updatedCount,
            0,
          );
          assert.equal((await report()).summary.expenseTotal, 308.8 + 49);
          throw rollback;
        }),
        (e) => {
          if (e !== rollback) throw e;
          return true;
        },
      );
    } finally {
      if (originalStorage === undefined)
        delete process.env.FINAPP_IMPORT_STORAGE;
      else process.env.FINAPP_IMPORT_STORAGE = originalStorage;
      await rm(path.join(process.cwd(), "data", "uploads", workspaceId), {
        recursive: true,
        force: true,
      });
      await pool.end();
    }
  },
);

test(
  "concurrent confirmations cannot add the same two purchases twice",
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async () => {
    const pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const db = drizzle(pool, { schema });
    const workspaceId = randomUUID(),
      userId = randomUUID(),
      memberId = randomUUID();
    const context = {
      workspaceId,
      userId,
      memberId,
      baseCurrency: "ILS",
      fxPolicy: "previous-month-v1" as const,
    };
    const originalStorage = process.env.FINAPP_IMPORT_STORAGE;
    process.env.FINAPP_IMPORT_STORAGE = "local";
    try {
      // Independent connections must see the fixture to exercise the account lock.
      await db.transaction(async (tx) => {
        await tx.insert(schema.workspaces).values({
          id: workspaceId,
          name: "Concurrent FX import",
          baseCurrency: "ILS",
          fxPolicy: context.fxPolicy,
        });
        await tx.insert(schema.users).values({
          id: userId,
          displayName: "Alex",
          email: userId + "@example.test",
        });
        await tx
          .insert(schema.workspaceMembers)
          .values({ id: memberId, workspaceId, userId, role: "owner" });
      });
      const workbook: WorkbookData = {
        fileKind: "xlsx",
        filename: "export.xlsx",
        sheets: [
          {
            name: "Card",
            rows: [
              ["Card"],
              [],
              ["November"],
              [
                "תאריך\nעסקה",
                "שם בית עסק",
                "סכום\nעסקה",
                "סכום\nחיוב",
                "סוג\nעסקה",
              ],
              ["22-11-2001", "CAFE", 7, 7],
              ["22-11-2001", "CAFE", 7, 7],
            ],
          },
        ],
      };
      const { parsed } = parseBankWorkbookToPreview({
        workbook,
        workspaceCurrency: "ILS",
      });
      const files = await Promise.all(
        ["overlap-one", "overlap-two"].map(async (name) => {
          const checksum = createHash("sha256").update(name).digest("hex");
          const plan = await analyzeParsedBankImport({
            context,
            parsed,
            fileChecksum: checksum,
            db,
          });
          assert.equal(plan.ambiguousRows.length, 2);
          return {
            name,
            decisions: Object.fromEntries(
              plan.ambiguousRows.map((row) => [row.key, "keep" as const]),
            ),
          };
        }),
      );
      const results = await Promise.allSettled(
        files.map(({ name, decisions }) =>
          persistBankImport(
            {
              workbook,
              originalFilename: name + ".xlsx",
              fileBuffer: Buffer.from(name),
              context,
              accountOwnerMemberId: memberId,
              rowDecisions: decisions,
            },
            (_user, callback) => db.transaction(callback),
          ),
        ),
      );
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      const stale = results.find((result) => result.status === "rejected");
      assert.match(String(stale?.reason), /review/i);
      assert.equal(
        (
          await db
            .select()
            .from(schema.transactions)
            .where(eq(schema.transactions.workspaceId, workspaceId))
        ).length,
        2,
      );
    } finally {
      if (originalStorage === undefined)
        delete process.env.FINAPP_IMPORT_STORAGE;
      else process.env.FINAPP_IMPORT_STORAGE = originalStorage;
      try {
        await db.transaction(async (tx) => {
          await tx
            .delete(schema.transactions)
            .where(eq(schema.transactions.workspaceId, workspaceId));
          await tx.execute(
            sql`delete from import_rows where import_id in (select id from imports where workspace_id=${workspaceId})`,
          );
          await tx
            .delete(schema.imports)
            .where(eq(schema.imports.workspaceId, workspaceId));
          await tx
            .delete(schema.financialAccounts)
            .where(eq(schema.financialAccounts.workspaceId, workspaceId));
          await tx
            .delete(schema.workspaceMembers)
            .where(eq(schema.workspaceMembers.workspaceId, workspaceId));
          await tx
            .delete(schema.workspaces)
            .where(eq(schema.workspaces.id, workspaceId));
          await tx.delete(schema.users).where(eq(schema.users.id, userId));
        });
      } finally {
        await rm(path.join(process.cwd(), "data", "uploads", workspaceId), {
          recursive: true,
          force: true,
        });
        await pool.end();
      }
    }
  },
);
