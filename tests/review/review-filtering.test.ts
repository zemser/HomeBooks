import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import {
  defaultReviewFilterState,
  filterAndSortReviewQueue,
  parseReviewFilterState,
  serializeReviewFilterState,
} from "../../src/features/expenses/review-filtering";
import type { ExpenseTransactionItem } from "../../src/features/expenses/types";

function transaction(
  id: string,
  overrides: Partial<ExpenseTransactionItem> = {},
): ExpenseTransactionItem {
  return {
    id,
    accountId: "account-1",
    importId: "import-1",
    importerMemberId: null,
    transactionDate: "2026-06-01",
    bookingDate: null,
    description: `Description ${id}`,
    merchantRaw: `Merchant ${id}`,
    originalAmount: "100",
    originalCurrency: "ILS",
    settlementAmount: null,
    settlementCurrency: null,
    normalizedAmount: "100",
    workspaceCurrency: "ILS",
    normalizationRateSource: null,
    direction: "debit",
    accountDisplayName: "Main account",
    importSourceName: "Bank",
    importOriginalFilename: "june.csv",
    classification: null,
    allocation: null,
    suggestion: null,
    similarQueueCount: 0,
    exactRuleExists: false,
    ...overrides,
  };
}

test("review URL state validates values and preserves unrelated parameters", () => {
  const parsed = parseReviewFilterState(
    "?transactionId=abc&q=coffee&month=2026-06&sort=unknown&view=high_value",
  );
  assert.equal(parsed.searchQuery, "coffee");
  assert.equal(parsed.month, "2026-06");
  assert.equal(parsed.sort, "newest");
  assert.equal(parsed.view, "high_value");

  const serialized = serializeReviewFilterState("?transactionId=abc", {
    ...defaultReviewFilterState,
    accountId: "account-2",
    minimumAmount: "25",
    sort: "amount_desc",
  });
  const params = new URLSearchParams(serialized);
  assert.equal(params.get("transactionId"), "abc");
  assert.equal(params.get("account"), "account-2");
  assert.equal(params.get("min"), "25");
  assert.equal(params.get("sort"), "amount_desc");
  assert.equal(params.has("view"), false);
});

test("combined review filters and sorting return only matching rows", () => {
  const queue = [
    transaction("one", {
      accountId: "account-2",
      importId: "import-2",
      transactionDate: "2026-05-03",
      merchantRaw: "Coffee House",
      normalizedAmount: "750",
      suggestion: {
        classificationType: "household",
        category: "Dining",
        categoryId: "category-1",
        memberOwnerId: null,
        memberOwnerName: null,
        matchingTransactionCount: 3,
        supportingTransactionCount: 3,
        confidence: "strong",
        source: "merchant_history",
      },
    }),
    transaction("two", {
      accountId: "account-2",
      importId: "import-2",
      transactionDate: "2026-05-04",
      merchantRaw: "Coffee House",
      normalizedAmount: "550",
      suggestion: {
        classificationType: "household",
        category: "Dining",
        categoryId: "category-1",
        memberOwnerId: null,
        memberOwnerName: null,
        matchingTransactionCount: 3,
        supportingTransactionCount: 3,
        confidence: "strong",
        source: "merchant_history",
      },
    }),
    transaction("three", { merchantRaw: "Grocer", normalizedAmount: "900" }),
  ];

  const result = filterAndSortReviewQueue(queue, {
    searchQuery: "coffee",
    month: "2026-05",
    importId: "import-2",
    accountId: "account-2",
    minimumAmount: "500",
    maximumAmount: "800",
    sort: "amount_desc",
    view: "suggested",
  });
  assert.deepEqual(result.map((item) => item.id), ["one", "two"]);
});

test("review filtering remains fast for 5,000 queue rows", () => {
  const queue = Array.from({ length: 5_000 }, (_, index) =>
    transaction(String(index), {
      merchantRaw: index % 5 === 0 ? "Target merchant" : `Merchant ${index}`,
      normalizedAmount: String(index),
      similarQueueCount: index % 3,
    }),
  );
  const startedAt = performance.now();
  const result = filterAndSortReviewQueue(queue, {
    ...defaultReviewFilterState,
    searchQuery: "target",
    minimumAmount: "500",
    sort: "amount_desc",
  });
  const durationMs = performance.now() - startedAt;

  assert.equal(result.length, 900);
  assert.equal(result[0]?.normalizedAmount, "4995");
  assert.ok(durationMs < 500, `Filtering took ${durationMs.toFixed(1)}ms`);
});
