import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

async function source(relativePath: string) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("bulk Classify selected starts from an empty form instead of the last classification", async () => {
  const reviewQueue = await source("src/components/expenses/review-queue-client.tsx");

  assert.match(reviewQueue, /function openBulkClassification\(prefill: BulkFormState = emptyBulkForm\)/);
  assert.match(reviewQueue, /onClick=\{\(\) => openBulkClassification\(\)\}/);
  assert.match(reviewQueue, /function closeBulkClassification\(\) \{[\s\S]*setBulkForm\(emptyBulkForm\)/);
  assert.match(reviewQueue, /closeBulkClassification\(\);\s*removeReviewedTransactions/);
});

test("checking a review row also focuses it in the detail panel", async () => {
  const reviewQueue = await source("src/components/expenses/review-queue-client.tsx");

  assert.match(
    reviewQueue,
    /function toggleSelectedTransaction\(transactionId: string\) \{\s*setSelectedIds\([\s\S]*?\);\s*setSelectedTransactionId\(transactionId\);\s*\}/,
  );
  assert.match(reviewQueue, /<h2>This transaction<\/h2>/);
  assert.match(reviewQueue, /table-row-checked/);
  assert.doesNotMatch(reviewQueue, /Selected transaction/);
});

test("category combobox follows the controlled value when the selected row changes", async () => {
  const [combobox, reviewQueue] = await Promise.all([
    source("src/components/workspaces/category-combobox.tsx"),
    source("src/components/expenses/review-queue-client.tsx"),
  ]);

  assert.match(combobox, /useEffect\(\(\) => \{\s*setQuery\(value\);\s*setPendingCreateName\(null\);\s*\}, \[value\]\)/);
  assert.doesNotMatch(combobox, /if \(!isOpen\) setQuery\(value\)/);
  assert.match(reviewQueue, /key=\{selectedTransaction\.id\}/);
});

test("category combobox requires a second enter or click before creating a category", async () => {
  const combobox = await source("src/components/workspaces/category-combobox.tsx");

  assert.match(combobox, /pendingCreateName/);
  assert.match(combobox, /handleCreateIntent/);
  assert.match(combobox, /else if \(canCreate\) handleCreateIntent\(\)/);
  assert.doesNotMatch(combobox, /else if \(canCreate\) void createCategory\(\)/);
  assert.match(combobox, /Adds this category to the workspace/);
  assert.match(combobox, /Press Enter or click again to create/);
});
