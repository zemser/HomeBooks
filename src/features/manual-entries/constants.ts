export const ONE_TIME_MANUAL_ENTRY_EVENT_KINDS = ["expense", "income"] as const;
export const ONE_TIME_MANUAL_ENTRY_CLASSIFICATION_TYPES = [
  "personal",
  "household",
  "income",
] as const;

export type OneTimeManualEntryEventKind = (typeof ONE_TIME_MANUAL_ENTRY_EVENT_KINDS)[number];
export type OneTimeManualEntryClassificationType =
  (typeof ONE_TIME_MANUAL_ENTRY_CLASSIFICATION_TYPES)[number];
