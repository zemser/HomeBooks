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

test("category combobox follows the controlled value when the selected row changes", async () => {
  const [combobox, reviewQueue] = await Promise.all([
    source("src/components/workspaces/category-combobox.tsx"),
    source("src/components/expenses/review-queue-client.tsx"),
  ]);

  assert.match(combobox, /useEffect\(\(\) => \{\s*setQuery\(value\);\s*\}, \[value\]\)/);
  assert.doesNotMatch(combobox, /if \(!isOpen\) setQuery\(value\)/);
  assert.match(reviewQueue, /key=\{selectedTransaction\.id\}/);
});
