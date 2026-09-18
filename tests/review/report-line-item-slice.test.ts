import assert from "node:assert/strict";
import test from "node:test";
import Big from "big.js";
import { buildReportHistoryHref, buildReportsHref, getReportSliceAmount, getReportSliceLabel, lineItemMatchesSlice, parseReportLineItemSlice, serializeReportLineItemSlice } from "../../src/features/reporting/line-item-slice";
import { buildCategoryScopeBreakdown, buildMemberIncomeSummaries, buildSpendingScopeSummaries, type MonthlyReportData, type MonthlyReportLineItem } from "../../src/features/reporting/monthly-report";

const lee = "00000000-0000-4000-8000-000000000001";
const izzy = "00000000-0000-4000-8000-000000000002";
const housing = "00000000-0000-4000-8000-000000000003";
const inactive = "00000000-0000-4000-8000-000000000004";
const retained = "00000000-0000-4000-8000-000000000005";
const metadata = {
  members: [{ id: lee, displayName: "Lee", isActive: true }, { id: izzy, displayName: "Izzy", isActive: true }, { id: inactive, displayName: "Past member", isActive: false }],
  categories: [{ id: housing, name: "Housing" }, { id: retained, name: "Past category" }],
};
function item(id: string, classificationType: MonthlyReportLineItem["classificationType"], memberId: string | null, categoryId: string | null, normalizedAmount: number, sourceKind: MonthlyReportLineItem["sourceKind"] = "imported_transaction"): MonthlyReportLineItem {
  return { id, classificationType, memberId, categoryId, normalizedAmount, sourceKind, sourceRecordId: id, sourceEventDate: "2026-08-15", sourceNormalizedAmount: 600, title: id, eventDate: "2026-06-01", direction: classificationType === "income" ? "income" : "expense", workspaceCurrency: "ILS", category: categoryId ? "Housing" : null, memberName: null, personalOwnerName: null, receivedByName: null, paidByName: null, fxDetails: null };
}
const items = [item("lee", "personal", lee, housing, 0.1), item("izzy", "personal", izzy, housing, 0.2, "one_time_manual"), item("shared", "shared", null, housing, 300, "recurring_generated"), item("income", "income", izzy, housing, 500), item("uncategorized", "shared", null, null, 10), item("unassigned-income", "income", null, null, 100), item("unassigned-personal", "personal", null, null, 5)];
function parse(query: string) { return parseReportLineItemSlice(new URLSearchParams(query), metadata); }
function matching(query: string) {
  const state = parse(query);
  assert.equal(state.status, "valid");
  if (state.status !== "valid") throw new Error("Expected valid fixture");
  return items.filter((row) => lineItemMatchesSlice(row, state.slice)).map((row) => row.id);
}

for (const [query, expected] of [
  [`kind=personal&member=${lee}`, ["lee"]],
  ["kind=shared", ["shared", "uncategorized"]],
  [`kind=expense&category=${housing}`, ["lee", "izzy", "shared"]],
  [`category=${housing}`, ["lee", "izzy", "shared"]],
  [`kind=shared&category=${housing}`, ["shared"]],
  ["kind=income", ["income", "unassigned-income"]],
  [`kind=income&member=${izzy}`, ["income"]],
  ["kind=expense", ["lee", "izzy", "shared", "uncategorized", "unassigned-personal"]],
  ["kind=expense&category=uncategorized", ["uncategorized", "unassigned-personal"]],
  ["kind=personal&member=unassigned", ["unassigned-personal"]],
  ["kind=income&member=unassigned", ["unassigned-income"]],
  [`kind=personal&member=${inactive}&category=${retained}`, []],
] as const) test(`matches ${query}`, () => assert.deepEqual(matching(query), expected));

for (const query of ["kind=garbage", "kind=", "member=unassigned", `category=${housing}&member=${lee}`, "kind=personal", `kind=shared&member=${lee}`, `kind=expense&member=${lee}`, "kind=income&member=missing", "category=missing", "category=", "kind=income&kind=expense", `kind=income&member=${lee}&member=${izzy}`]) {
  test(`unavailable filter retains raw request: ${query}`, () => {
    const params = new URLSearchParams(query);
    const original = params.toString();
    assert.equal(parseReportLineItemSlice(params, metadata).status, "unavailable");
    assert.equal(params.toString(), original);
  });
}

test("canonical URLs and year navigation", () => {
  const state = parse(`category=${housing}`);
  assert.equal(state.status, "valid");
  if (state.status !== "valid") return;
  assert.equal(serializeReportLineItemSlice(state.slice).toString(), `kind=expense&category=${housing}`);
  assert.equal(buildReportsHref("month", "2026-06-01", "allocated_period", state.slice, true), `/reports?view=month&month=2026-06&mode=allocated_period&kind=expense&category=${housing}#line-items`);
  assert.equal(buildReportsHref("year", "2026-06-01", "allocated_period", state.slice, true), "/reports?view=year&month=2026-06&mode=allocated_period");
  assert.equal(parse(`view=year&kind=garbage`).status, "none");
  assert.equal(getReportSliceLabel(state.slice, metadata), "Housing");
});

test("all clickable summaries reconcile to their rows with decimal arithmetic", () => {
  const spendingScopes = buildSpendingScopeSummaries(items, metadata.members);
  const report = {
    lineItems: items, sliceMetadata: metadata, spendingScopes,
    categoryScopeBreakdown: buildCategoryScopeBreakdown(items, spendingScopes),
    memberIncome: buildMemberIncomeSummaries(items, metadata.members),
    summary: { incomeTotal: 600, expenseTotal: 315.3 },
  } as MonthlyReportData;
  for (const query of ["kind=expense", "kind=income", "kind=shared", `kind=personal&member=${lee}`, `category=${housing}`, `kind=shared&category=${housing}`, `kind=income&member=${izzy}`, `kind=income&category=${housing}`, "kind=expense&category=uncategorized", `kind=personal&member=${inactive}`]) {
    const state = parse(query);
    assert.equal(state.status, "valid");
    if (state.status !== "valid") continue;
    const expected = Number(items.filter((row) => lineItemMatchesSlice(row, state.slice)).reduce((total, row) => total.plus(row.normalizedAmount), new Big(0)).toString());
    assert.equal(getReportSliceAmount(report, state.slice), expected, query);
  }
});

test("History uses the original August payment month for a June allocation", () => {
  assert.equal(buildReportHistoryHref(items[0]), "/transactions/all?transactionId=lee&month=2026-08");
  assert.equal(buildReportHistoryHref({ ...items[0], eventDate: "2026-08-15" }), "/transactions/all?transactionId=lee&month=2026-08");
  assert.equal(buildReportHistoryHref({ ...items[0], sourceEventDate: null }), null);
  assert.equal(buildReportHistoryHref({ ...items[0], sourceRecordId: null }), null);
  assert.equal(buildReportHistoryHref(items[1]), null);
  assert.equal(buildReportHistoryHref(items[2]), null);
});
