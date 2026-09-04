import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonthCompleteness,
  buildYearReportData,
  type ReportMember,
  type YearAggregationRecord,
} from "../../src/features/reporting/monthly-report";

const members: ReportMember[] = [
  { id: "lee", displayName: "Lee", isActive: true },
  { id: "izzy", displayName: "Izzy", isActive: true },
  { id: "sam", displayName: "Sam", isActive: false },
];

function record(
  eventDate: string,
  classificationType: YearAggregationRecord["classificationType"],
  normalizedAmount: number,
  memberId: string | null = null,
): YearAggregationRecord {
  return {
    eventDate,
    classificationType,
    normalizedAmount,
    direction: classificationType === "income" ? "income" : "expense",
    category: "General",
    categoryId: "general",
    memberId,
  };
}

function completeness(
  month: string,
  importedTransactionCount: number,
  reviewedTransactionCount: number,
  manualEntryCount = 0,
) {
  return buildMonthCompleteness(month, {
    importedTransactionCount,
    reviewedTransactionCount,
    reportableTransactionCount: reviewedTransactionCount,
    excludedTransactionCount: 0,
    manualEntryCount,
  });
}

test("year reporting reconciles dynamic scope columns, totals, and averages", () => {
  const report = buildYearReportData({
    year: 2026,
    workspaceCurrency: "ILS",
    includedMonths: ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"],
    members,
    records: [
      record("2026-01-10", "income", 100, "lee"),
      record("2026-01-11", "personal", 20, "lee"),
      record("2026-01-12", "shared", 10),
      record("2026-02-01", "household", 30),
      record("2026-02-02", "personal", 5, "sam"),
    ],
    completeness: [
      completeness("2026-01-01", 3, 3),
      completeness("2026-02-01", 2, 1),
      completeness("2026-03-01", 2, 2),
      completeness("2026-04-01", 0, 0),
    ],
  });

  assert.deepEqual(
    report.months.map((month) => month.status),
    ["complete", "in_progress", "complete", "empty"],
  );
  assert.deepEqual(
    report.totals.scopes.map((scope) => [scope.label, scope.expenseTotal]),
    [
      ["Personal · Lee", 20],
      ["Personal · Izzy", 0],
      ["Personal · Sam", 5],
      ["Shared", 10],
      ["Household", 30],
    ],
  );
  assert.equal(report.totals.incomeTotal, 100);
  assert.equal(report.totals.expenseTotal, 65);
  assert.equal(report.totals.savingsTotal, 35);
  assert.equal(report.averages.monthlyIncome, 25);
  assert.equal(report.averages.monthlyExpense, 16.25);
  assert.equal(report.averages.monthlySavings, 8.75);
  assert.equal(
    report.months.reduce((total, month) => total + month.expenseTotal, 0),
    report.totals.expenseTotal,
  );
  assert.ok(report.months.every((month) => month.scopes.length === report.totals.scopes.length));
});

test("a reviewed zero-spend month remains distinct from an empty month", () => {
  const report = buildYearReportData({
    year: 2025,
    workspaceCurrency: "ILS",
    includedMonths: ["2025-01-01", "2025-02-01"],
    members,
    records: [],
    completeness: [
      completeness("2025-01-01", 1, 1),
      completeness("2025-02-01", 0, 0),
    ],
  });

  assert.equal(report.months[0].status, "complete");
  assert.equal(report.months[0].expenseTotal, 0);
  assert.equal(report.months[1].status, "empty");
});
