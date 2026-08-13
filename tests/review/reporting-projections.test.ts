import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  const [classifications, manualEntries, imports, recurring, categories, allocations] =
    await Promise.all([
      readFile(repositoryFile("src/features/expenses/classifications.ts"), "utf8"),
      readFile(repositoryFile("src/features/manual-entries/service.ts"), "utf8"),
      readFile(repositoryFile("src/features/imports/persistence.ts"), "utf8"),
      readFile(repositoryFile("src/features/recurring/service.ts"), "utf8"),
      readFile(repositoryFile("src/features/workspaces/categories.ts"), "utf8"),
      readFile(repositoryFile("src/features/expenses/allocation.ts"), "utf8"),
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
});
