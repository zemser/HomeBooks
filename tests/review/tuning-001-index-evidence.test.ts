import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const evidence = readFileSync(new URL("../../docs/tuning-001-index-evidence.md", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../src/db/schema.ts", import.meta.url), "utf8");

test("TUNING-001 keeps a clear evidence-backed index waiver", () => {
  assert.match(evidence, /Status: Waived/);
  assert.match(evidence, /Do not add an index in TUNING-001/);
  assert.match(evidence, /EXPLAIN \(ANALYZE, BUFFERS\)/);
  assert.match(evidence, /Revisit criteria/);

  for (const indexName of [
    "transactions_workspace_date_idx",
    "transactionUnique",
    "expense_allocations_event_idx",
    "imports_workspace_type_created_idx",
    "classification_rules_workspace_priority_idx",
  ]) {
    assert.match(schema, new RegExp(indexName));
  }
});
