import type { ClassificationType } from "@/features/expenses/constants";

const PAYER_CLASSIFICATION_TYPES = new Set<ClassificationType>([
  "personal",
  "shared",
  "income",
]);

export function classificationAllowsPayer(classificationType: ClassificationType) {
  return PAYER_CLASSIFICATION_TYPES.has(classificationType);
}

export function getPayerValidationMessage(input: {
  classificationType: ClassificationType;
  payerMemberId: string | null;
}) {
  if (input.classificationType === "personal" && !input.payerMemberId) {
    return "Personal classifications require a member owner.";
  }

  if (!classificationAllowsPayer(input.classificationType) && input.payerMemberId) {
    return `${input.classificationType === "household" ? "Household" : "Transfer and Ignore"} classifications cannot have a payer.`;
  }

  return null;
}
