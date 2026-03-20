export const CLASSIFICATION_TYPES = [
  "personal",
  "shared",
  "household",
  "income",
  "transfer",
  "ignore",
] as const;

export const DECISION_SOURCES = ["rule", "user", "system_default"] as const;

export type ClassificationType = (typeof CLASSIFICATION_TYPES)[number];
export type DecisionSource = (typeof DECISION_SOURCES)[number];
