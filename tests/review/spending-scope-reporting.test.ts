import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCategoryScopeBreakdown,
  buildMemberIncomeSummaries,
  buildSpendingScopeSummaries,
  type ReportMember,
  type ScopeAggregationRecord,
} from "../../src/features/reporting/monthly-report";

const lee: ReportMember = { id: "lee", displayName: "Lee", isActive: true };

function record(
  input: Partial<ScopeAggregationRecord> &
    Pick<ScopeAggregationRecord, "classificationType" | "normalizedAmount">,
): ScopeAggregationRecord {
  return {
    category: "Dining",
    categoryId: "dining",
    direction: input.classificationType === "income" ? "income" : "expense",
    memberId: null,
    ...input,
  };
}

test("one-member reporting includes personal, shared, and household buckets", () => {
  const records = [
    record({ classificationType: "personal", memberId: lee.id, normalizedAmount: 0.1 }),
    record({ classificationType: "personal", memberId: lee.id, normalizedAmount: 0.2 }),
    record({ classificationType: "shared", normalizedAmount: 10 }),
    record({
      classificationType: "household",
      category: "Groceries",
      categoryId: "groceries",
      normalizedAmount: 20,
    }),
    record({ classificationType: "income", memberId: lee.id, normalizedAmount: 100 }),
  ];
  const scopes = buildSpendingScopeSummaries(records, [lee]);
  const categories = buildCategoryScopeBreakdown(records, scopes);

  assert.deepEqual(
    scopes.map((scope) => [scope.label, scope.expenseTotal, scope.itemCount]),
    [
      ["Personal · Lee", 0.3, 2],
      ["Shared", 10, 1],
      ["Household", 20, 1],
    ],
  );
  assert.equal(
    scopes.reduce((total, scope) => total + scope.expenseTotal, 0),
    30.3,
  );
  assert.equal(
    categories.reduce((total, category) => total + category.expenseTotal, 0),
    30.3,
  );
  for (const category of categories) {
    assert.equal(
      category.amounts.reduce((total, amount) => total + amount.amount, 0),
      category.expenseTotal,
    );
  }
});

test("active members receive zero buckets and referenced inactive members remain visible", () => {
  const members: ReportMember[] = [
    lee,
    { id: "izzy", displayName: "Izzy", isActive: true },
    { id: "sam", displayName: "Sam", isActive: false },
  ];
  const records = [
    record({ classificationType: "personal", memberId: "izzy", normalizedAmount: 7 }),
    record({ classificationType: "personal", memberId: "sam", normalizedAmount: 5 }),
  ];
  const scopes = buildSpendingScopeSummaries(records, members);

  assert.deepEqual(
    scopes.map((scope) => [scope.label, scope.expenseTotal]),
    [
      ["Personal · Lee", 0],
      ["Personal · Izzy", 7],
      ["Personal · Sam", 5],
      ["Shared", 0],
      ["Household", 0],
    ],
  );
});

test("three active members receive independent personal buckets", () => {
  const members: ReportMember[] = [
    lee,
    { id: "izzy", displayName: "Izzy", isActive: true },
    { id: "sam", displayName: "Sam", isActive: true },
  ];
  const records = [
    record({ classificationType: "personal", memberId: "lee", normalizedAmount: 4 }),
    record({ classificationType: "personal", memberId: "izzy", normalizedAmount: 5 }),
    record({ classificationType: "personal", memberId: "sam", normalizedAmount: 6 }),
  ];

  assert.deepEqual(
    buildSpendingScopeSummaries(records, members).map((scope) => [scope.label, scope.expenseTotal]),
    [
      ["Personal · Lee", 4],
      ["Personal · Izzy", 5],
      ["Personal · Sam", 6],
      ["Shared", 0],
      ["Household", 0],
    ],
  );
});

test("income attribution stays outside spending scopes", () => {
  const records = [
    record({ classificationType: "income", memberId: lee.id, normalizedAmount: 80 }),
    record({ classificationType: "income", normalizedAmount: 20 }),
    record({ classificationType: "personal", memberId: lee.id, normalizedAmount: 15 }),
  ];
  const scopes = buildSpendingScopeSummaries(records, [lee]);
  const income = buildMemberIncomeSummaries(records, [lee]);

  assert.equal(scopes.reduce((total, scope) => total + scope.expenseTotal, 0), 15);
  assert.deepEqual(
    income.map((item) => [item.memberName, item.incomeTotal]),
    [
      ["Lee", 80],
      ["Unassigned", 20],
    ],
  );
});

test("missing expense categories are grouped under Uncategorized", () => {
  const records = [
    record({
      classificationType: "household",
      category: null,
      categoryId: null,
      normalizedAmount: 12,
    }),
  ];
  const scopes = buildSpendingScopeSummaries(records, [lee]);
  const [category] = buildCategoryScopeBreakdown(records, scopes);

  assert.equal(category.category, "Uncategorized");
  assert.equal(category.expenseTotal, 12);
});
