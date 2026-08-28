import type { ClassificationType } from "@/features/expenses/constants";

export type ExpenseEventKind = "expense" | "income";

const PAYER_CLASSIFICATION_TYPES = new Set<ClassificationType>([
  "personal",
  "shared",
  "income",
]);

export function classificationAllowsPayer(classificationType: ClassificationType) {
  return PAYER_CLASSIFICATION_TYPES.has(classificationType);
}

export function classificationMatchesEventKind(
  eventKind: ExpenseEventKind,
  classificationType: ClassificationType,
) {
  return eventKind === "income"
    ? classificationType === "income"
    : classificationType !== "income";
}

export function classificationsForEventKind<T extends ClassificationType>(
  eventKind: ExpenseEventKind,
  classificationTypes: readonly T[],
) {
  return classificationTypes.filter((classificationType) =>
    classificationMatchesEventKind(eventKind, classificationType),
  );
}

export function normalizeClassificationForEventKind<T extends ClassificationType>(
  eventKind: ExpenseEventKind,
  classificationType: T,
): ClassificationType {
  if (classificationMatchesEventKind(eventKind, classificationType)) {
    return classificationType;
  }

  return eventKind === "income" ? "income" : "household";
}

export function getEventKindClassificationValidationMessage(input: {
  eventKind: ExpenseEventKind;
  classificationType: ClassificationType;
}) {
  if (input.eventKind === "income" && input.classificationType !== "income") {
    return "Income entries must use income classification.";
  }

  if (input.eventKind === "expense" && input.classificationType === "income") {
    return "Expense entries cannot use income classification.";
  }

  return null;
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
