import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_REVIEW_PAGE_SIZE,
  MAX_REVIEW_PAGE_SIZE,
  parseReviewQuery,
} from "../../src/features/expenses/review-query";

test("review query parses filters, focus, and pagination", () => {
  const query = parseReviewQuery(
    new URLSearchParams(
      "q=coffee&month=2026-06&account=account-1&sort=amount_desc&page=3&pageSize=25&transactionId=transaction-1",
    ),
  );

  assert.equal(query.searchQuery, "coffee");
  assert.equal(query.month, "2026-06");
  assert.equal(query.accountId, "account-1");
  assert.equal(query.sort, "amount_desc");
  assert.equal(query.page, 3);
  assert.equal(query.pageSize, 25);
  assert.equal(query.transactionId, "transaction-1");
});

test("review query defaults invalid pages and caps page size", () => {
  const invalid = parseReviewQuery(new URLSearchParams("page=-2&pageSize=nope"));
  assert.equal(invalid.page, 1);
  assert.equal(invalid.pageSize, DEFAULT_REVIEW_PAGE_SIZE);

  const oversized = parseReviewQuery(new URLSearchParams("pageSize=5000"));
  assert.equal(oversized.pageSize, MAX_REVIEW_PAGE_SIZE);
});
