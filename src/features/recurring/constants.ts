export const EVENT_KINDS = ["expense", "income"] as const;
export const NORMALIZATION_MODES = ["monthly_average", "fixed_rate", "none"] as const;
export const RECURRENCE_RULES = ["monthly"] as const;

export type EventKind = (typeof EVENT_KINDS)[number];
export type NormalizationMode = (typeof NORMALIZATION_MODES)[number];
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number];
