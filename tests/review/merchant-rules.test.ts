import assert from "node:assert/strict";
import test from "node:test";
import { canAutoApplyMerchantRule, merchantRuleAttribution, merchantRuleExceptionMessage } from "../../src/features/expenses/merchant-rules";
import { CLASSIFICATION_TYPES } from "../../src/features/expenses/constants";

const people = { personalOwnerMemberId: null, paidByMemberId: null, receivedByMemberId: null };

test("same merchant on different accounts uses each account's payer and personal owner", () => {
  for (const classificationType of ["household", "shared", "personal"] as const) {
    for (const owner of ["alex", "sam"]) {
      const rule = { classificationType, ...people };
      assert.equal(canAutoApplyMerchantRule(rule, owner), true);
      const result = merchantRuleAttribution(classificationType, owner);
      assert.equal(result.paidByMemberId, owner);
      assert.equal(result.personalOwnerMemberId, classificationType === "personal" ? owner : null);
    }
  }
});

test("joint or unknown accounts never auto-assign people", () => {
  for (const classificationType of CLASSIFICATION_TYPES) {
    assert.equal(canAutoApplyMerchantRule({ classificationType, ...people }, null), ["transfer", "ignore"].includes(classificationType));
    assert.deepEqual(merchantRuleAttribution(classificationType, null), people);
  }
});

test("old rule snapshots cannot silently pin or reinterpret any member", () => {
  for (const field of Object.keys(people)) {
    assert.equal(canAutoApplyMerchantRule({ classificationType: "personal", ...people, [field]: "alex" }, "sam"), false);
  }
});

test("personal exceptions may be classified, but cannot be saved as automatic rules", () => {
  assert.match(merchantRuleExceptionMessage({ classificationType: "personal", accountOwnerMemberId: "sam", personalOwnerMemberId: "alex", paidByMemberId: "sam", receivedByMemberId: null })!, /exception/);
  assert.equal(merchantRuleExceptionMessage({ classificationType: "personal", accountOwnerMemberId: "sam", personalOwnerMemberId: "sam", paidByMemberId: "sam", receivedByMemberId: null }), null);
});

test("income follows account owner and excluded types never acquire people", () => {
  assert.deepEqual(merchantRuleAttribution("income", "sam"), { ...people, receivedByMemberId: "sam" });
  assert.deepEqual(merchantRuleAttribution("ignore", "sam"), people);
  assert.deepEqual(merchantRuleAttribution("transfer", "sam"), people);
});
