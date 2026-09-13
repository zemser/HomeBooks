import { CLASSIFICATION_TYPES, type ClassificationType } from "@/features/expenses/constants";

const CLASSIFICATION_TYPE_SET = new Set<string>(CLASSIFICATION_TYPES);

export type LegacyScopeSnapshot = {
  classificationType: string;
  splitForSettlement?: boolean | null;
};

export type NormalizedScope = {
  classificationType: ClassificationType;
  splitForSettlement: boolean;
};

export function isClassificationType(value: string): value is ClassificationType {
  return CLASSIFICATION_TYPE_SET.has(value);
}

export function mapClassificationType(value: string): ClassificationType {
  const mapped = value === "household" ? "shared" : value;

  if (!isClassificationType(mapped)) {
    throw new Error(`Unsupported classification type: ${value}`);
  }

  return mapped;
}

export function normalizeLegacyScope(snapshot: LegacyScopeSnapshot): NormalizedScope {
  const classificationType = mapClassificationType(snapshot.classificationType);

  if (snapshot.splitForSettlement !== undefined && snapshot.splitForSettlement !== null) {
    return {
      classificationType,
      splitForSettlement: classificationType === "shared" ? Boolean(snapshot.splitForSettlement) : false,
    };
  }

  return {
    classificationType,
    splitForSettlement: snapshot.classificationType === "shared",
  };
}

export function normalizeLegacyRuleScope(snapshot: {
  defaultClassificationType: string;
  defaultSplitForSettlement?: boolean | null;
}): {
  defaultClassificationType: ClassificationType;
  defaultSplitForSettlement: boolean;
} {
  const normalized = normalizeLegacyScope({
    classificationType: snapshot.defaultClassificationType,
    splitForSettlement: snapshot.defaultSplitForSettlement,
  });

  return {
    defaultClassificationType: normalized.classificationType,
    defaultSplitForSettlement: normalized.splitForSettlement,
  };
}

export function inferBackfillSplitForSettlement(input: {
  originalClassificationType: string;
  splitForSettlement?: boolean | null;
  activeMemberCount: number;
}): boolean {
  const classificationType = mapClassificationType(input.originalClassificationType);

  if (classificationType !== "shared") {
    return false;
  }

  if (input.splitForSettlement !== undefined && input.splitForSettlement !== null) {
    return Boolean(input.splitForSettlement);
  }

  if (input.originalClassificationType === "household") {
    return false;
  }

  return input.activeMemberCount >= 2;
}
