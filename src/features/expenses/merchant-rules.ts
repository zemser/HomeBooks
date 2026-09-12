import type { ClassificationType } from "@/features/expenses/constants";
import { normalizeMemberAttribution } from "@/features/expenses/payer";

export function merchantRuleAttribution(classificationType: ClassificationType, accountOwnerMemberId: string | null) {
  return normalizeMemberAttribution({
    classificationType,
    personalOwnerMemberId: accountOwnerMemberId,
    paidByMemberId: accountOwnerMemberId,
    receivedByMemberId: accountOwnerMemberId,
  });
}

export function canAutoApplyMerchantRule(rule: {
  classificationType: ClassificationType;
  personalOwnerMemberId: string | null;
  paidByMemberId: string | null;
  receivedByMemberId: string | null;
}, accountOwnerMemberId: string | null) {
  // Old full-decision snapshots need confirmation, never silently reinterpret them.
  if (rule.personalOwnerMemberId || rule.paidByMemberId || rule.receivedByMemberId) return false;
  return rule.classificationType === "transfer" || rule.classificationType === "ignore" || Boolean(accountOwnerMemberId);
}

export function merchantRuleExceptionMessage(input: {
  classificationType: ClassificationType;
  accountOwnerMemberId: string | null;
  personalOwnerMemberId?: string | null;
  paidByMemberId?: string | null;
  receivedByMemberId?: string | null;
}) {
  if (input.classificationType === "transfer" || input.classificationType === "ignore") return null;
  if (!input.accountOwnerMemberId) return "Choose an account owner before saving an automatic rule. You can still classify this transaction individually.";
  const expected = merchantRuleAttribution(input.classificationType, input.accountOwnerMemberId);
  if ((input.personalOwnerMemberId ?? null) !== expected.personalOwnerMemberId ||
      (input.paidByMemberId ?? null) !== expected.paidByMemberId ||
      (input.receivedByMemberId ?? null) !== expected.receivedByMemberId) {
    return "This assignment is an exception to the account owner. Save this transaction without an automatic rule.";
  }
  return null;
}
