import assert from "node:assert/strict";
import test from "node:test";

import {
  classificationAllowsPayer,
  classificationsForEventKind,
  getEventKindClassificationValidationMessage,
  getPayerValidationMessage,
  normalizeClassificationForEventKind,
} from "../../src/features/expenses/payer";

test("unassigned household expenses are valid but cannot be attributed to one payer", () => {
  assert.equal(
    getPayerValidationMessage({ classificationType: "household", payerMemberId: null }),
    null,
  );
  assert.match(
    getPayerValidationMessage({
      classificationType: "household",
      payerMemberId: "member-1",
    }) ?? "",
    /cannot have a payer/,
  );
});

test("personal requires attribution while shared and income allow optional attribution", () => {
  assert.match(
    getPayerValidationMessage({ classificationType: "personal", payerMemberId: null }) ?? "",
    /require a member owner/,
  );
  assert.equal(
    getPayerValidationMessage({ classificationType: "shared", payerMemberId: null }),
    null,
  );
  assert.equal(
    getPayerValidationMessage({ classificationType: "income", payerMemberId: "member-1" }),
    null,
  );
  assert.equal(classificationAllowsPayer("household"), false);
  assert.equal(classificationAllowsPayer("income"), true);
});

test("transfer and ignore never accept payer attribution", () => {
  for (const classificationType of ["transfer", "ignore"] as const) {
    assert.match(
      getPayerValidationMessage({ classificationType, payerMemberId: "member-1" }) ?? "",
      /cannot have a payer/,
    );
  }
});

test("event kinds expose only compatible classifications", () => {
  const allClassifications = [
    "personal",
    "shared",
    "household",
    "income",
    "transfer",
    "ignore",
  ] as const;

  assert.deepEqual(classificationsForEventKind("income", allClassifications), ["income"]);
  assert.deepEqual(classificationsForEventKind("expense", allClassifications), [
    "personal",
    "shared",
    "household",
    "transfer",
    "ignore",
  ]);
  assert.match(
    getEventKindClassificationValidationMessage({
      eventKind: "income",
      classificationType: "household",
    }) ?? "",
    /must use income/,
  );
});

test("legacy event-kind mismatches normalize to a compatible classification", () => {
  assert.equal(normalizeClassificationForEventKind("income", "shared"), "income");
  assert.equal(normalizeClassificationForEventKind("expense", "income"), "household");
  assert.equal(normalizeClassificationForEventKind("expense", "shared"), "shared");
});
