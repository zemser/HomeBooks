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

test("merchant rules restore both owner and payer for personal expenses", () => {
  const names = new Map([
    ["izzy", "Izzy"],
    ["lee", "Lee"],
  ]);
  const suggestion = buildExactMerchantSuggestions(
    [
      decision("Gift shop", "personal", "Gifts", {
        personalOwnerMemberId: "izzy",
        paidByMemberId: "lee",
      }),
      decision("Gift shop", "personal", "Gifts", {
        personalOwnerMemberId: "izzy",
        paidByMemberId: "lee",
      }),
    ],
    names,
  ).get("gift shop");

  assert.equal(suggestion?.personalOwnerMemberId, "izzy");
  assert.equal(suggestion?.personalOwnerName, "Izzy");
  assert.equal(suggestion?.paidByMemberId, "lee");
  assert.equal(suggestion?.paidByName, "Lee");
});

test("different personal payers do not create false suggestion consensus", () => {
  const suggestion = buildExactMerchantSuggestions([
    decision("Gift shop", "personal", "Gifts", {
      personalOwnerMemberId: "izzy",
      paidByMemberId: "lee",
    }),
    decision("Gift shop", "personal", "Gifts", {
      personalOwnerMemberId: "izzy",
      paidByMemberId: "izzy",
    }),
  ]).get("gift shop");

  assert.equal(suggestion, undefined);
});

test("member evidence follows owner, payer, and income recipient eligibility", () => {
  const names = new Map([["member-1", "Alex"]]);
  const personal = buildExactMerchantSuggestions(
    [
      decision("Personal merchant", "personal", "Personal", {
        personalOwnerMemberId: "member-1",
        paidByMemberId: "member-1",
      }),
      decision("Personal merchant", "personal", "Personal", {
        personalOwnerMemberId: "member-1",
        paidByMemberId: "member-1",
      }),
    ],
    names,
  ).get("personal merchant");
  assert.equal(personal?.personalOwnerName, "Alex");

  const household = buildExactMerchantSuggestions([
    decision("Household merchant", "household", "Home", { paidByMemberId: "member-1" }),
    decision("Household merchant", "household", "Home", { paidByMemberId: "member-1" }),
  ]).get("household merchant");
  assert.equal(household?.paidByMemberId, "member-1");
  assert.equal(household?.personalOwnerMemberId, null);

  const income = buildExactMerchantSuggestions(
    [
      decision("Salary", "income", "Salary", { receivedByMemberId: "member-1" }),
      decision("Salary", "income", "Salary", { receivedByMemberId: "member-1" }),
    ],
    names,
  ).get("salary");
  assert.equal(income?.receivedByMemberId, "member-1");
  assert.equal(income?.receivedByName, "Alex");
});

test("different income receivers do not create false suggestion consensus", () => {
  const suggestion = buildExactMerchantSuggestions([
    decision("Salary", "income", "Salary", { receivedByMemberId: "member-1" }),
    decision("Salary", "income", "Salary", { receivedByMemberId: "member-1" }),
    decision("Salary", "income", "Salary", { receivedByMemberId: "member-2" }),
    decision("Salary", "income", "Salary", { receivedByMemberId: "member-2" }),
  ]).get("salary");

  assert.equal(suggestion, undefined);
});
