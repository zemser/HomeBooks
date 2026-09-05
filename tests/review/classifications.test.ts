import assert from "node:assert/strict";
import test from "node:test";

import { validateClassificationInput, ClassificationInputError } from "../../src/features/expenses/classifications";
import { formatClassificationSummary } from "../../src/features/expenses/presentation";

test("classification validation rejects member owners on non-member types", () => {
  assert.throws(
    () => validateClassificationInput({
      classificationType: "transfer",
      personalOwnerMemberId: "member-1",
      category: null,
    }),
    ClassificationInputError,
  );
});

test("classification validation rejects categories on transfer and ignore", () => {
  assert.throws(
    () => validateClassificationInput({
      classificationType: "ignore",
      category: "Fees",
    }),
    ClassificationInputError,
  );
});

test("personal classifications still require a member owner", () => {
  assert.throws(
    () => validateClassificationInput({
      classificationType: "personal",
      paidByMemberId: "member-1",
      category: "Dining",
    }),
    ClassificationInputError,
  );
});

test("personal owner and payer can differ", () => {
  validateClassificationInput({
    classificationType: "personal",
    personalOwnerMemberId: "izzy",
    paidByMemberId: "lee",
    category: "Dining",
  });
});

test("household can record a payer", () => {
  validateClassificationInput({
    classificationType: "household",
    paidByMemberId: "lee",
    category: "Utilities",
  });
});

test("classification summaries keep owner and payer distinct", () => {
  assert.equal(
    formatClassificationSummary({
      classificationType: "personal",
      category: "Gifts",
      categoryId: "gifts",
      personalOwnerMemberId: "izzy",
      personalOwnerName: "Izzy",
      paidByMemberId: "lee",
      paidByName: "Lee",
      receivedByMemberId: null,
      receivedByName: null,
      decidedBy: "user",
      reviewedAt: null,
    }),
    "Personal / Izzy / paid by Lee / Gifts",
  );
  assert.equal(
    formatClassificationSummary({
      classificationType: "household",
      category: "Utilities",
      categoryId: "utilities",
      personalOwnerMemberId: null,
      personalOwnerName: null,
      paidByMemberId: "izzy",
      paidByName: "Izzy",
      receivedByMemberId: null,
      receivedByName: null,
      decidedBy: "user",
      reviewedAt: null,
    }),
    "Household / paid by Izzy / Utilities",
  );
});
