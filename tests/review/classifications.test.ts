import assert from "node:assert/strict";
import test from "node:test";

import { validateClassificationInput, ClassificationInputError } from "../../src/features/expenses/classifications";

test("classification validation rejects member owners on non-member types", () => {
  assert.throws(
    () => validateClassificationInput({
      classificationType: "transfer",
      memberOwnerId: "member-1",
      category: null,
    }),
    ClassificationInputError,
  );
});

test("classification validation rejects categories on transfer and ignore", () => {
  assert.throws(
    () => validateClassificationInput({
      classificationType: "ignore",
      memberOwnerId: null,
      category: "Fees",
    }),
    ClassificationInputError,
  );
});

test("personal classifications still require a member owner", () => {
  assert.throws(
    () => validateClassificationInput({
      classificationType: "personal",
      memberOwnerId: null,
      category: "Dining",
    }),
    ClassificationInputError,
  );
});
