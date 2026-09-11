import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_HISTORY_PAGE_SIZE,
  HISTORY_IMPORT_ALL,
  HISTORY_IMPORT_UNRESOLVED,
  HISTORY_MONTH_ALL,
  HISTORY_MONTH_UNRESOLVED,
  parseHistoryQuery,
  serializeHistoryQuery,
  shouldShowHistoryManuals,
} from "../../src/features/expenses/history-query";

test("history query parses month, import, search, and pagination", () => {
  const query = parseHistoryQuery(
    new URLSearchParams(
      "q=coffee&month=2026-04&import=import-1&reviewStatus=needs_review&page=2&pageSize=25&transactionId=transaction-1",
    ),
  );

  assert.equal(query.searchQuery, "coffee");
  assert.equal(query.month, "2026-04");
  assert.equal(query.importId, "import-1");
  assert.equal(query.reviewStatus, "needs_review");
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 25);
  assert.equal(query.transactionId, "transaction-1");
  assert.equal(query.monthSpecified, true);
  assert.equal(query.importSpecified, true);
});

test("history query distinguishes omitted month from explicit month=all", () => {
  const omitted = parseHistoryQuery(new URLSearchParams());
  assert.equal(omitted.month, HISTORY_MONTH_UNRESOLVED);
  assert.equal(omitted.importId, HISTORY_IMPORT_UNRESOLVED);
  assert.equal(omitted.pageSize, DEFAULT_HISTORY_PAGE_SIZE);

  const explicitAll = parseHistoryQuery(new URLSearchParams("month=all&import=all"));
  assert.equal(explicitAll.month, HISTORY_MONTH_ALL);
  assert.equal(explicitAll.importId, HISTORY_IMPORT_ALL);

  const serializedAll = serializeHistoryQuery("", {
    month: HISTORY_MONTH_ALL,
    importId: HISTORY_IMPORT_ALL,
    searchQuery: "",
    reviewStatus: "all",
    page: 1,
    pageSize: DEFAULT_HISTORY_PAGE_SIZE,
  });
  const params = new URLSearchParams(serializedAll);
  assert.equal(params.get("month"), "all");
  assert.equal(params.get("import"), "all");
});

test("history manuals stay hidden unless a calendar month is selected", () => {
  assert.equal(shouldShowHistoryManuals({ month: HISTORY_MONTH_UNRESOLVED }), false);
  assert.equal(shouldShowHistoryManuals({ month: HISTORY_MONTH_ALL }), false);
  assert.equal(shouldShowHistoryManuals({ month: "2026-04" }), true);
});


test("serialized page 1 remains explicit when a transaction is selected", () => {
  const query = parseHistoryQuery(new URLSearchParams(
    "month=2026-04&page=2&transactionId=selected-on-page-2",
  ));
  const restored = parseHistoryQuery(new URLSearchParams(
    serializeHistoryQuery("", { ...query, page: 1 }),
  ));
  assert.equal(restored.page, 1);
  assert.equal(restored.pageSpecified, true);
  assert.equal(restored.transactionId, "selected-on-page-2");
  assert.equal(parseHistoryQuery(new URLSearchParams("transactionId=focus")).pageSpecified, false);
});
