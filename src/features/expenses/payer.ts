import type { ClassificationType } from "@/features/expenses/constants";

export type ExpenseEventKind = "expense" | "income";

export type MemberAttribution = {
  personalOwnerMemberId: string | null;
  paidByMemberId: string | null;
  receivedByMemberId: string | null;
};

const PAYER_CLASSIFICATION_TYPES = new Set<ClassificationType>([
  "personal",
  "shared",
  "household",
]);

export function classificationAllowsPayer(classificationType: ClassificationType) {
  return PAYER_CLASSIFICATION_TYPES.has(classificationType);
}

export function classificationAllowsPersonalOwner(classificationType: ClassificationType) {
  return classificationType === "personal";
}

export function classificationAllowsRecipient(classificationType: ClassificationType) {
  return classificationType === "income";
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

function classificationLabel(classificationType: ClassificationType) {
  switch (classificationType) {
    case "personal":
      return "Personal";
    case "shared":
      return "Shared";
    case "household":
      return "Household";
    case "income":
      return "Income";
    case "transfer":
      return "Transfer";
    case "ignore":
      return "Ignore";
  }
}

export function emptyMemberAttribution(): MemberAttribution {
  return {
    personalOwnerMemberId: null,
    paidByMemberId: null,
    receivedByMemberId: null,
  };
}

export function normalizeMemberAttribution(input: {
  classificationType: ClassificationType;
  personalOwnerMemberId?: string | null;
  paidByMemberId?: string | null;
  receivedByMemberId?: string | null;
}): MemberAttribution {
  return {
    personalOwnerMemberId: classificationAllowsPersonalOwner(input.classificationType)
      ? input.personalOwnerMemberId ?? null
      : null,
    paidByMemberId: classificationAllowsPayer(input.classificationType)
      ? input.paidByMemberId ?? null
      : null,
    receivedByMemberId: classificationAllowsRecipient(input.classificationType)
      ? input.receivedByMemberId ?? null
      : null,
  };
}

export function compatibilityMemberOwnerId(
  classificationType: ClassificationType,
  attribution: MemberAttribution,
) {
  switch (classificationType) {
    case "personal":
      return attribution.personalOwnerMemberId;
    case "shared":
    case "household":
      return attribution.paidByMemberId;
    case "income":
      return attribution.receivedByMemberId;
    default:
      return null;
  }
}

export function reportScopeMemberId(
  classificationType: ClassificationType,
  attribution: MemberAttribution,
) {
  if (classificationType === "personal") {
    return attribution.personalOwnerMemberId;
  }

  if (classificationType === "income") {
    return attribution.receivedByMemberId;
  }

  return null;
}

export function getMemberAttributionValidationMessage(input: {
  classificationType: ClassificationType;
  personalOwnerMemberId?: string | null;
  paidByMemberId?: string | null;
  receivedByMemberId?: string | null;
}) {
  const attribution = {
    personalOwnerMemberId: input.personalOwnerMemberId ?? null,
    paidByMemberId: input.paidByMemberId ?? null,
    receivedByMemberId: input.receivedByMemberId ?? null,
  };

  if (input.classificationType === "personal" && !attribution.personalOwnerMemberId) {
    return "Personal classifications require a member owner.";
  }

  if (input.classificationType !== "personal" && attribution.personalOwnerMemberId) {
    return `${classificationLabel(input.classificationType)} classifications cannot have a personal owner.`;
  }

  if (!classificationAllowsPayer(input.classificationType) && attribution.paidByMemberId) {
    return input.classificationType === "income"
      ? "Income classifications cannot have a payer."
      : "Transfer and Ignore classifications cannot have a payer.";
  }

  if (!classificationAllowsRecipient(input.classificationType) && attribution.receivedByMemberId) {
    return `${classificationLabel(input.classificationType)} classifications cannot have an income recipient.`;
  }

  return null;
}

export function resolveImportedPaidByMemberId(input: {
  classificationType: ClassificationType;
  paidByMemberId?: string | null;
  accountOwnerMemberId: string | null;
}) {
  if (!classificationAllowsPayer(input.classificationType)) {
    return null;
  }

  if (input.paidByMemberId !== undefined) {
    return input.paidByMemberId;
  }

  return input.accountOwnerMemberId;
}

export function backfillImportedMemberAttribution(input: {
  classificationType: ClassificationType;
  memberOwnerId: string | null;
  accountOwnerMemberId: string | null;
}): MemberAttribution {
  switch (input.classificationType) {
    case "personal":
      return {
        personalOwnerMemberId: input.memberOwnerId,
        paidByMemberId: input.accountOwnerMemberId,
        receivedByMemberId: null,
      };
    case "shared":
      return {
        personalOwnerMemberId: null,
        paidByMemberId: input.memberOwnerId,
        receivedByMemberId: null,
      };
    case "household":
      return {
        personalOwnerMemberId: null,
        paidByMemberId: input.accountOwnerMemberId,
        receivedByMemberId: null,
      };
    case "income":
      return {
        personalOwnerMemberId: null,
        paidByMemberId: null,
        receivedByMemberId: input.memberOwnerId,
      };
    default:
      return emptyMemberAttribution();
  }
}

export function backfillManualMemberAttribution(input: {
  classificationType: ClassificationType;
  payerMemberId: string | null;
}): MemberAttribution {
  switch (input.classificationType) {
    case "personal":
      return {
        personalOwnerMemberId: input.payerMemberId,
        paidByMemberId: input.payerMemberId,
        receivedByMemberId: null,
      };
    case "shared":
    case "household":
      return {
        personalOwnerMemberId: null,
        paidByMemberId: input.payerMemberId,
        receivedByMemberId: null,
      };
    case "income":
      return {
        personalOwnerMemberId: null,
        paidByMemberId: null,
        receivedByMemberId: input.payerMemberId,
      };
    default:
      return emptyMemberAttribution();
  }
}

export function backfillRuleMemberAttribution(input: {
  classificationType: ClassificationType;
  defaultMemberOwnerId: string | null;
}): MemberAttribution {
  switch (input.classificationType) {
    case "personal":
      return {
        personalOwnerMemberId: input.defaultMemberOwnerId,
        paidByMemberId: input.defaultMemberOwnerId,
        receivedByMemberId: null,
      };
    case "shared":
    case "household":
      return {
        personalOwnerMemberId: null,
        paidByMemberId: input.defaultMemberOwnerId,
        receivedByMemberId: null,
      };
    case "income":
      return {
        personalOwnerMemberId: null,
        paidByMemberId: null,
        receivedByMemberId: input.defaultMemberOwnerId,
      };
    default:
      return emptyMemberAttribution();
  }
}

export function memberAttributionFromSnapshot(input: {
  classificationType: ClassificationType;
  memberOwnerId?: string | null;
  personalOwnerMemberId?: string | null;
  paidByMemberId?: string | null;
  receivedByMemberId?: string | null;
  defaultMemberOwnerId?: string | null;
  defaultPersonalOwnerMemberId?: string | null;
  defaultPaidByMemberId?: string | null;
  defaultReceivedByMemberId?: string | null;
}): MemberAttribution {
  const hasNewFields =
    input.personalOwnerMemberId !== undefined ||
    input.paidByMemberId !== undefined ||
    input.receivedByMemberId !== undefined ||
    input.defaultPersonalOwnerMemberId !== undefined ||
    input.defaultPaidByMemberId !== undefined ||
    input.defaultReceivedByMemberId !== undefined;

  if (hasNewFields) {
    return {
      personalOwnerMemberId:
        input.personalOwnerMemberId ?? input.defaultPersonalOwnerMemberId ?? null,
      paidByMemberId: input.paidByMemberId ?? input.defaultPaidByMemberId ?? null,
      receivedByMemberId: input.receivedByMemberId ?? input.defaultReceivedByMemberId ?? null,
    };
  }

  return backfillImportedMemberAttribution({
    classificationType: input.classificationType,
    memberOwnerId: input.memberOwnerId ?? input.defaultMemberOwnerId ?? null,
    accountOwnerMemberId: null,
  });
}
