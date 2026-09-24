import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

async function source(relativePath: string) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("a new batch starts empty and does not keep the previous category", async () => {
  const reviewQueue = await source("src/components/expenses/review-queue-client.tsx");

  assert.match(reviewQueue, /function replaceBulkForm\(next: BulkFormState\) \{\s*setBulkForm\(next\);\s*setBulkFormGeneration/);
  assert.match(
    reviewQueue,
    /if \(\(!isMarked && current\.length === 0\) \|\| next\.length === 0\) \{\s*replaceBulkForm\(emptyBulkForm\);/,
  );
  assert.match(reviewQueue, /if \(startingEmpty\) replaceBulkForm\(emptyBulkForm\)/);
  assert.match(reviewQueue, /function closeBulkClassification\(\) \{[\s\S]*replaceBulkForm\(emptyBulkForm\)/);
  assert.match(reviewQueue, /closeBulkClassification\(\);\s*removeReviewedTransactions/);
  assert.match(reviewQueue, /key=\{formGeneration\}/);
  assert.doesNotMatch(reviewQueue, /isBulkModalOpen \? "bulk-open" : "bulk-closed"/);
  assert.match(reviewQueue, /function openBulkClassification\(\) \{\s*setIsBulkModalOpen\(true\);/);
  assert.match(reviewQueue, /if \(isStacked\) setIsBulkModalOpen\(true\);/);
  assert.match(reviewQueue, /classificationType: singleForm\.classificationType/);
  assert.match(reviewQueue, /getReviewStackedServerSnapshot\(\) \{\s*return false;/);
  assert.match(reviewQueue, /max-width: 960px/);
  assert.doesNotMatch(reviewQueue, /min-width:\s*961px/);
  assert.doesNotMatch(reviewQueue, /window\.innerWidth/);
});

test("checking a review row also focuses it in the detail panel", async () => {
  const reviewQueue = await source("src/components/expenses/review-queue-client.tsx");

  assert.match(
    reviewQueue,
    /function toggleSelectedTransaction\(transactionId: string\) \{[\s\S]*?setSelectedTransactionId\(transactionId\);/,
  );
  assert.match(reviewQueue, /<h2>This transaction<\/h2>/);
  assert.match(reviewQueue, /table-row-checked/);
  assert.match(reviewQueue, /Check more rows to classify them together in this panel/);
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
