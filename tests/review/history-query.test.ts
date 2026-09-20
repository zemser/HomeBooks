import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_HISTORY_PAGE_SIZE,
  HISTORY_ACCOUNT_ALL,
  HISTORY_MONTH_ALL,
  HISTORY_MONTH_UNRESOLVED,
  buildHistoryMonthHref,
  parseHistoryQuery,
  resolveHistoryAccountId,
  serializeHistoryQuery,
  shouldShowHistoryManuals,
} from "../../src/features/expenses/history-query";
import {
  earliestYearMonth,
  formatYearMonthLabel,
  latestNavigableYearMonth,
  localYearMonth,
  shiftYearMonth,
  yearMonth,
} from "../../src/lib/dates/months";

test("history query parses month, account, search, and pagination", () => {
  const query = parseHistoryQuery(
    new URLSearchParams(
      "q=coffee&month=2026-04&account=account-1&reviewStatus=needs_review&page=2&pageSize=25&transactionId=transaction-1",
    ),
  );

  assert.equal(query.searchQuery, "coffee");
  assert.equal(query.month, "2026-04");
  assert.equal(query.accountId, "account-1");
  assert.equal(query.reviewStatus, "needs_review");
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 25);
  assert.equal(query.transactionId, "transaction-1");
  assert.equal(query.monthSpecified, true);
});

test("history query distinguishes omitted month from explicit month=all", () => {
  const omitted = parseHistoryQuery(new URLSearchParams());
  assert.equal(omitted.month, HISTORY_MONTH_UNRESOLVED);
  assert.equal(omitted.accountId, HISTORY_ACCOUNT_ALL);
  assert.equal(omitted.pageSize, DEFAULT_HISTORY_PAGE_SIZE);

  const explicitAll = parseHistoryQuery(new URLSearchParams("month=all"));
  assert.equal(explicitAll.month, HISTORY_MONTH_ALL);
  assert.equal(explicitAll.accountId, HISTORY_ACCOUNT_ALL);

  const serializedAll = serializeHistoryQuery("", {
    month: HISTORY_MONTH_ALL,
    accountId: HISTORY_ACCOUNT_ALL,
    searchQuery: "",
    reviewStatus: "all",
    page: 1,
    pageSize: DEFAULT_HISTORY_PAGE_SIZE,
  });
  const params = new URLSearchParams(serializedAll);
  assert.equal(params.get("month"), "all");
  assert.equal(params.get("account"), null);
  assert.equal(params.get("import"), null);
});

test("legacy History import params are dropped on serialize", () => {
  const serialized = serializeHistoryQuery("import=import-1&month=2026-04", {
    month: "2026-04",
    accountId: HISTORY_ACCOUNT_ALL,
    searchQuery: "",
    reviewStatus: "all",
    page: 1,
    pageSize: DEFAULT_HISTORY_PAGE_SIZE,
  });
  const params = new URLSearchParams(serialized);
  assert.equal(params.get("import"), null);
  assert.equal(params.get("month"), "2026-04");
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

test("automatic classification filter survives URL round trips", () => {
  const query = parseHistoryQuery(new URLSearchParams("month=all&reviewStatus=automatic"));
  assert.equal(query.reviewStatus, "automatic");
  assert.equal(parseHistoryQuery(new URLSearchParams(serializeHistoryQuery("", query))).reviewStatus, "automatic");
});

test("year-month helpers shift calendar months", () => {
  assert.equal(shiftYearMonth("2026-01", -1), "2025-12");
  assert.equal(shiftYearMonth("2025-12", 1), "2026-01");
  assert.match(yearMonth(new Date("2026-09-20T00:00:00.000Z")), /^\d{4}-\d{2}$/);
});

test("unknown History accounts fall back to all accounts", () => {
  assert.equal(resolveHistoryAccountId("account-1", [{ id: "account-1" }]), "account-1");
  assert.equal(resolveHistoryAccountId("missing", [{ id: "account-1" }]), HISTORY_ACCOUNT_ALL);
  assert.equal(resolveHistoryAccountId(HISTORY_ACCOUNT_ALL, [{ id: "account-1" }]), HISTORY_ACCOUNT_ALL);
});

test("History statement links land on the activity month, not a filename search", () => {
  assert.equal(
    buildHistoryMonthHref({ month: "2026-04-18" }),
    "/transactions/all?month=2026-04",
  );
  assert.equal(
    buildHistoryMonthHref({ month: "2026-04-18", reviewStatus: "automatic" }),
    "/transactions/all?month=2026-04&reviewStatus=automatic",
  );
  assert.equal(buildHistoryMonthHref({}), "/transactions/all?month=all");
});

test("month navigation bounds follow activity and the local calendar", () => {
  assert.equal(earliestYearMonth(["2026-09", "2026-04", "2025-12"]), "2025-12");
  assert.equal(earliestYearMonth([]), null);
  assert.equal(formatYearMonthLabel("2026-04"), "April 2026");
  assert.equal(
    latestNavigableYearMonth("2026-03", new Date("2026-09-20T12:00:00")),
    localYearMonth(new Date("2026-09-20T12:00:00")),
  );
  assert.equal(
    latestNavigableYearMonth("2027-01", new Date("2026-09-20T12:00:00")),
    "2027-01",
  );
});
