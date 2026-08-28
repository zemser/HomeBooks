import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExactMerchantSuggestions,
  normalizeMerchantRuleValue,
  type HistoricalClassificationDecision,
} from "../../src/features/expenses/suggestions";

function decision(
  merchantRaw: string,
  classificationType: HistoricalClassificationDecision["classificationType"] = "household",
  category: string | null = "Dining",
  memberOwnerId: string | null = null,
): HistoricalClassificationDecision {
  return { merchantRaw, classificationType, category, categoryId: null, memberOwnerId };
}

test("unanimous exact-merchant history produces a strong suggestion", () => {
  const suggestions = buildExactMerchantSuggestions([
    decision(" Coffee House "),
    decision("coffee house"),
  ]);
  const suggestion = suggestions.get(normalizeMerchantRuleValue("COFFEE HOUSE"));

  assert.equal(suggestion?.confidence, "strong");
  assert.equal(suggestion?.supportingTransactionCount, 2);
  assert.equal(suggestion?.matchingTransactionCount, 2);
  assert.equal(suggestion?.category, "Dining");
});

test("a 75 percent winner produces a likely suggestion", () => {
  const suggestions = buildExactMerchantSuggestions([
    decision("Merchant", "household", "Groceries"),
    decision("Merchant", "household", "Groceries"),
    decision("Merchant", "household", "Groceries"),
    decision("Merchant", "personal", "Personal", "member-1"),
  ]);
  const suggestion = suggestions.get("merchant");

  assert.equal(suggestion?.confidence, "likely");
  assert.equal(suggestion?.supportingTransactionCount, 3);
  assert.equal(suggestion?.matchingTransactionCount, 4);
});

test("insufficient and conflicting history does not produce a suggestion", () => {
  const insufficient = buildExactMerchantSuggestions([decision("One row")]);
  assert.equal(insufficient.has("one row"), false);

  const conflict = buildExactMerchantSuggestions([
    decision("Split", "household"),
    decision("Split", "personal", "Personal", "member-1"),
  ]);
  assert.equal(conflict.has("split"), false);
});

test("member evidence follows payer eligibility, including income receivers", () => {
  const names = new Map([["member-1", "Alex"]]);
  const personal = buildExactMerchantSuggestions(
    [
      decision("Personal merchant", "personal", "Personal", "member-1"),
      decision("Personal merchant", "personal", "Personal", "member-1"),
    ],
    names,
  ).get("personal merchant");
  assert.equal(personal?.memberOwnerName, "Alex");

  const household = buildExactMerchantSuggestions([
    decision("Household merchant", "household", "Home", "member-1"),
    decision("Household merchant", "household", "Home", "member-1"),
  ]).get("household merchant");
  assert.equal(household?.memberOwnerId, null);

  const income = buildExactMerchantSuggestions(
    [
      decision("Salary", "income", "Salary", "member-1"),
      decision("Salary", "income", "Salary", "member-1"),
    ],
    names,
  ).get("salary");
  assert.equal(income?.memberOwnerId, "member-1");
  assert.equal(income?.memberOwnerName, "Alex");
});

test("different income receivers do not create false suggestion consensus", () => {
  const suggestion = buildExactMerchantSuggestions([
    decision("Salary", "income", "Salary", "member-1"),
    decision("Salary", "income", "Salary", "member-1"),
    decision("Salary", "income", "Salary", "member-2"),
    decision("Salary", "income", "Salary", "member-2"),
  ]).get("salary");

  assert.equal(suggestion, undefined);
});
