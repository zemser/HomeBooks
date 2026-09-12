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

export function canSaveMerchantRule(input: {
  merchantRaw?: string | null;
  classificationType?: ClassificationType | "";
}) {
  return Boolean(input.merchantRaw?.trim()) && Boolean(input.classificationType);
}

export function merchantRuleAttributionNote(input: {
  classificationType: ClassificationType;
  accountOwnerMemberId: string | null;
  personalOwnerMemberId?: string | null;
  paidByMemberId?: string | null;
  receivedByMemberId?: string | null;
}) {
  if (input.classificationType === "transfer" || input.classificationType === "ignore") return null;
  if (!input.accountOwnerMemberId) return null;
  const expected = merchantRuleAttribution(input.classificationType, input.accountOwnerMemberId);
  if ((input.personalOwnerMemberId ?? null) !== expected.personalOwnerMemberId ||
      (input.paidByMemberId ?? null) !== expected.paidByMemberId ||
      (input.receivedByMemberId ?? null) !== expected.receivedByMemberId) {
    return "This transaction keeps the people you chose. Later matches still follow each account’s owner, not this exception.";
  }
  return null;
}
