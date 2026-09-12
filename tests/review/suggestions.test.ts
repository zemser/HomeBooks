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
  members: {
    personalOwnerMemberId?: string | null;
    paidByMemberId?: string | null;
    receivedByMemberId?: string | null;
  } = {},
): HistoricalClassificationDecision {
  return {
    merchantRaw,
    classificationType,
    category,
    categoryId: null,
    personalOwnerMemberId: members.personalOwnerMemberId ?? null,
    paidByMemberId: members.paidByMemberId ?? null,
    receivedByMemberId: members.receivedByMemberId ?? null,
  };
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
    decision("Merchant", "personal", "Personal", { personalOwnerMemberId: "member-1" }),
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
    decision("Split", "personal", "Personal", { personalOwnerMemberId: "member-1" }),
  ]);
  assert.equal(conflict.has("split"), false);
});

test("suggestions reuse classification but never historical people", () => {
  for (const classificationType of ["household", "shared", "personal", "income"] as const) {
    const suggestion = buildExactMerchantSuggestions([
      decision("Merchant", classificationType, "Category", { personalOwnerMemberId: "alex", paidByMemberId: "alex", receivedByMemberId: "alex" }),
      decision("Merchant", classificationType, "Category", { personalOwnerMemberId: "sam", paidByMemberId: "sam", receivedByMemberId: "sam" }),
    ]).get("merchant");
    assert.equal(suggestion?.classificationType, classificationType);
    assert.equal(suggestion?.confidence, "strong");
    assert.equal(suggestion?.personalOwnerMemberId, null);
    assert.equal(suggestion?.paidByMemberId, null);
    assert.equal(suggestion?.receivedByMemberId, null);
  }
});
