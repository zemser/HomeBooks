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

test("shared can record a payer", () => {
  validateClassificationInput({
    classificationType: "shared",
    paidByMemberId: "lee",
    category: "Utilities",
  });
});

test("interactive one-member saves reject split for settlement", () => {
  assert.throws(
    () => validateClassificationInput({
      classificationType: "shared",
      splitForSettlement: true,
      category: "Dining",
      activeMemberCount: 1,
      writeMode: "interactive",
    }),
    ClassificationInputError,
  );
  validateClassificationInput({
    classificationType: "shared",
    splitForSettlement: true,
    category: "Dining",
    activeMemberCount: 2,
    writeMode: "interactive",
  });
  validateClassificationInput({
    classificationType: "shared",
    splitForSettlement: true,
    category: "Dining",
    activeMemberCount: 1,
    writeMode: "replay",
  });
});

test("split for settlement is rejected on non-shared types", () => {
  for (const classificationType of ["personal", "income", "transfer", "ignore"] as const) {
    assert.throws(
      () => validateClassificationInput({
        classificationType,
        splitForSettlement: true,
        personalOwnerMemberId: classificationType === "personal" ? "izzy" : null,
        category: classificationType === "transfer" || classificationType === "ignore" ? null : "Dining",
        activeMemberCount: 2,
      }),
      ClassificationInputError,
    );
  }
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
      splitForSettlement: false,
      decidedBy: "user",
      reviewedAt: null,
    }),
    "Personal / Izzy / paid by Lee / Gifts",
  );
  assert.equal(
    formatClassificationSummary({
      classificationType: "shared",
      category: "Utilities",
      categoryId: "utilities",
      personalOwnerMemberId: null,
      personalOwnerName: null,
      paidByMemberId: "izzy",
      paidByName: "Izzy",
      receivedByMemberId: null,
      receivedByName: null,
      splitForSettlement: false,
      decidedBy: "user",
      reviewedAt: null,
    }),
    "Shared / paid by Izzy / Utilities",
  );
  assert.equal(
    formatClassificationSummary({
      classificationType: "shared",
      category: "Dining",
      categoryId: "dining",
      personalOwnerMemberId: null,
      personalOwnerName: null,
      paidByMemberId: "lee",
      paidByName: "Lee",
      receivedByMemberId: null,
      receivedByName: null,
      splitForSettlement: true,
      decidedBy: "user",
      reviewedAt: null,
    }),
    "Shared, split later / paid by Lee / Dining",
  );
});
