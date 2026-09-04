import assert from "node:assert/strict";
import test from "node:test";

import { buildMonthCompleteness } from "../../src/features/reporting/monthly-report";

const month = "2026-08-01";

function counts(overrides: Partial<Parameters<typeof buildMonthCompleteness>[1]> = {}) {
  return {
    importedTransactionCount: 0,
    reviewedTransactionCount: 0,
    reportableTransactionCount: 0,
    excludedTransactionCount: 0,
    manualEntryCount: 0,
    ...overrides,
  };
}

test("a month without imported or manual activity is empty", () => {
  const result = buildMonthCompleteness(month, counts());

  assert.equal(result.status, "empty");
  assert.equal(result.pendingTransactionCount, 0);
});

test("a month with any unreviewed imported transaction is in progress", () => {
  const result = buildMonthCompleteness(
    month,
    counts({
      importedTransactionCount: 5,
      reviewedTransactionCount: 3,
      reportableTransactionCount: 2,
      excludedTransactionCount: 1,
    }),
  );

  assert.equal(result.status, "in_progress");
  assert.equal(result.pendingTransactionCount, 2);
});

test("transfer and ignore classifications count as reviewed and complete", () => {
  const result = buildMonthCompleteness(
    month,
    counts({
      importedTransactionCount: 4,
      reviewedTransactionCount: 4,
      reportableTransactionCount: 2,
      excludedTransactionCount: 2,
    }),
  );

  assert.equal(result.status, "complete");
  assert.equal(result.pendingTransactionCount, 0);
});

test("manual-only activity is complete without an import review step", () => {
  const result = buildMonthCompleteness(month, counts({ manualEntryCount: 2 }));

  assert.equal(result.status, "complete");
  assert.equal(result.importedTransactionCount, 0);
});
