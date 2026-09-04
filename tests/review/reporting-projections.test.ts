import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { expenseAllocationsEqual } from "../../src/features/expenses/allocation-core";

const repositoryFile = (path: string) => new URL(`../../${path}`, import.meta.url);

test("reporting projection invalidation matrix covers every source mutation owner", async () => {
  const matrix = await readFile(
    repositoryFile("docs/reporting-projection-invalidation.md"),
    "utf8",
  );

  for (const mutation of [
    "Single classification",
    "Bulk classification",
    "Classification undo",
    "Import persistence",
    "One-time manual create/update/delete",
    "Recurring materialization",
    "Recurring definition create/update/version",
    "Recurring definition deactivate/delete",
    "Category rename",
    "Allocation update",
    "Shared settlement update",
    "Projection repair",
  ]) {
    assert.match(matrix, new RegExp(`\\| ${mutation.replaceAll("/", "\\/")}`));
  }

  assert.match(matrix, /Auth, file parsing, Storage operations, network calls, and streaming work stay outside/);
  assert.match(matrix, /Home and reporting page renders are projection consumers/);
});

test("source mutation services maintain reporting projections with their transaction executor", async () => {
  const [classifications, manualEntries, imports, recurring, categories, allocations, settlements] =
    await Promise.all([
      readFile(repositoryFile("src/features/expenses/classifications.ts"), "utf8"),
      readFile(repositoryFile("src/features/manual-entries/service.ts"), "utf8"),
      readFile(repositoryFile("src/features/imports/persistence.ts"), "utf8"),
      readFile(repositoryFile("src/features/recurring/service.ts"), "utf8"),
      readFile(repositoryFile("src/features/workspaces/categories.ts"), "utf8"),
      readFile(repositoryFile("src/features/expenses/allocation.ts"), "utf8"),
      readFile(repositoryFile("src/features/shared-settlements/service.ts"), "utf8"),
    ]);

  assert.match(classifications, /syncTransactionExpenseEvents\(context, requestedTransactionIds, tx\)/);
  assert.match(classifications, /syncTransactionExpenseEvents\(context, transactionIds, tx\)/);
  assert.match(classifications, /syncTransactionExpenseEvents\(context, batch\.transactionIds, tx\)/);
  assert.match(manualEntries, /syncManualEntryExpenseEvents\(context, \[entry\.id\], tx\)/);
  assert.match(manualEntries, /syncManualEntryExpenseEvents\(context, \[manualEntryId\], tx\)/);
  assert.match(imports, /syncTransactionExpenseEvents\([\s\S]*automaticClassifications[\s\S]*tx,/);
  assert.match(recurring, /syncManualEntryExpenseEvents\([\s\S]*affectedManualEntryIds[\s\S]*tx,/);
  assert.match(categories, /syncTransactionExpenseEvents\(context, transactionIds, tx\)/);
  assert.match(categories, /syncManualEntryExpenseEvents\(context, manualEntryIds, tx\)/);
  assert.match(allocations, /return db\.transaction\(async \(tx\) =>/);
  assert.match(settlements, /update\(transactionClassifications\)[\s\S]*syncTransactionExpenseEvents/);
  assert.match(settlements, /update\(manualEntries\)[\s\S]*syncManualEntryExpenseEvents/);
  assert.match(settlements, /overrideType: "payer"/);
  assert.match(settlements, /await acquireRecurringMaterializationLock\(context, tx\)/);
  assert.match(settlements, /onConflictDoUpdate/);
});

test("allocation comparison treats equivalent stored amounts as unchanged", () => {
  const stored = [
    {
      reportMonth: "2026-08-01",
      allocatedAmount: "42.000000",
      allocationMethod: "single_month" as const,
      coverageStartDate: "2026-08-13",
      coverageEndDate: "2026-08-13",
    },
  ];

  assert.equal(
    expenseAllocationsEqual(stored, [{ ...stored[0], allocatedAmount: "42" }]),
    true,
  );
  assert.equal(
    expenseAllocationsEqual(stored, [{ ...stored[0], allocatedAmount: "41.999999" }]),
    false,
  );
  assert.equal(
    expenseAllocationsEqual(stored, [{ ...stored[0], reportMonth: "2026-09-01" }]),
    false,
  );
});

test("projection synchronizers skip unchanged event, allocation, and recurring rows", async () => {
  const [events, allocations, recurring] = await Promise.all([
    readFile(repositoryFile("src/features/reporting/expense-events.ts"), "utf8"),
    readFile(repositoryFile("src/features/expenses/allocation.ts"), "utf8"),
    readFile(repositoryFile("src/features/recurring/service.ts"), "utf8"),
  ]);

  assert.match(events, /else if \(!expenseEventMatches\(primaryRow, row, nextReportingMode\)\)/);
  assert.match(events, /!expenseAllocationsEqual\(primaryRow\.allocations, nextAllocations\)/);
  assert.match(allocations, /expenseAllocationsEqual\(currentAllocations, allocations\)/);
  assert.match(recurring, /if \(generatedManualEntryMatches\(existingRow, effectiveRow\)\) \{\s*continue;/);
  assert.match(recurring, /manualEntryOverrides\.overrideType, "payer"/);
  assert.ok(
    recurring.indexOf("await acquireRecurringMaterializationLock(context, tx)") <
      recurring.indexOf("const recurringEntries = await listRecurringEntries(context, tx)"),
  );
});

test("payer migration normalizes legacy rows and constrains recurring overrides", async () => {
  const migration = await readFile(
    repositoryFile("src/db/migrations/0011_calm_prodigy.sql"),
    "utf8",
  );

  assert.match(migration, /UPDATE "manual_recurring_expenses"[\s\S]*"classification_type"/);
  assert.match(migration, /UPDATE "manual_entries"[\s\S]*"payer_member_id" = NULL/);
  assert.match(migration, /DELETE FROM "shared_expense_splits"/);
  assert.match(migration, /UNIQUE\("manual_entry_id","override_type"\)/);
});

test("home and report rendering are read-only projection consumers", async () => {
  const [home, homePage, reportService, reportsPage] = await Promise.all([
    readFile(repositoryFile("src/features/home/service.ts"), "utf8"),
    readFile(repositoryFile("src/app/(app)/page.tsx"), "utf8"),
    readFile(repositoryFile("src/features/reporting/monthly-report.ts"), "utf8"),
    readFile(repositoryFile("src/app/(app)/reports/page.tsx"), "utf8"),
  ]);

  assert.doesNotMatch(home, /syncExpenseEventsForRange|materializeRecurringEntriesForRange/);
  assert.doesNotMatch(reportService, /syncExpenseEventsForRange|materializeRecurringEntriesForRange/);
  assert.doesNotMatch(reportsPage, /syncExpenseEventsForRange|materializeRecurringEntriesForRange/);
  assert.match(homePage, /<Suspense fallback=\{<RouteDataFallback label="Selected month" \/>\}>/);
  assert.match(homePage, /<Suspense fallback=\{<HomeCardFallback label="Recent activity" \/>\}>/);
  assert.match(homePage, /const getSelectedHomeMonth = cache/);
  assert.match(homePage, /getLatestFinancialActivityMonth\(context, db\)/);
  assert.match(homePage, /getWorkspaceHomeReportingSnapshot\(context, \{ month \}, db\)/);
  assert.match(homePage, /getWorkspaceHomeActivitySnapshot\(context, \{ month \}, db\)/);
  assert.match(home, /selectDistinct\(\{ importId: transactions\.importId \}\)/);
  assert.doesNotMatch(home, /earliestTransactionDate < nextMonth/);
  assert.match(reportsPage, /getYearReport\(context/);
});

test("payment-date and allocated-period reports use the synchronized occurrence payer", async () => {
  const reportService = await readFile(
    repositoryFile("src/features/reporting/monthly-report.ts"),
    "utf8",
  );

  assert.match(reportService, /memberId: transaction\.memberOwnerId/);
  assert.match(reportService, /memberId: entry\.payerMemberId/);
  assert.match(reportService, /memberId: row\.payerMemberId/);
  assert.match(reportService, /const key = record\.memberId \?\? "unassigned"/);
  assert.match(reportService, /expenseTotal = sumMoney\(spendingScopes\.map/);
  assert.match(reportService, /spendingScopes: SpendingScopeSummary\[\]/);
  assert.match(reportService, /categoryScopeBreakdown: MonthlyCategoryScopeBreakdownItem\[\]/);
});

test("projection repair reconciles canonical and stale source IDs in the request transaction", async () => {
  const [events, route] = await Promise.all([
    readFile(repositoryFile("src/features/reporting/expense-events.ts"), "utf8"),
    readFile(repositoryFile("src/app/api/reporting/projections/repair/route.ts"), "utf8"),
  ]);

  assert.match(events, /export async function repairExpenseEventProjections/);
  assert.match(events, /\.filter\(\(row\) => row\.sourceType === "transaction"\)/);
  assert.match(events, /row\.sourceType === "manual" \|\| row\.sourceType === "recurring"/);
  assert.match(route, /withCurrentWorkspaceDb\(\(context, db\) =>/);
  assert.match(route, /repairExpenseEventProjections\(context, db\)/);
});

test("import projection persistence preserves duplicate, rollback, and Storage boundaries", async () => {
  const source = await readFile(
    repositoryFile("src/features/imports/persistence.ts"),
    "utf8",
  );
  const storageWrite = source.indexOf("await writeImportFile({");
  const persistenceTransaction = source.indexOf(
    "await withDbTransaction(input.context.userId, async (tx) =>",
    storageWrite,
  );
  const projectionSync = source.indexOf("await syncTransactionExpenseEvents(", persistenceTransaction);
  const importCompletion = source.indexOf('importStatus: "completed"', projectionSync);
  const storageCleanup = source.indexOf(
    "await deleteImportFileAfterSuccessfulPersistence(storagePath)",
    importCompletion,
  );

  assert.ok(storageWrite >= 0);
  assert.ok(persistenceTransaction > storageWrite);
  assert.ok(projectionSync > persistenceTransaction);
  assert.ok(importCompletion > projectionSync);
  assert.ok(storageCleanup > importCompletion);
  assert.match(source, /existingImport\.importStatus === "failed" && existingTransactionCount === 0/);
  assert.match(source, /if \(duplicateCheck\?\.duplicate\) return duplicateCheck\.duplicate/);
  assert.match(source, /catch \(error\) \{[\s\S]*importStatus: "failed"/);
});
