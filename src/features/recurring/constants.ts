export const EVENT_KINDS = ["expense", "income"] as const;
export const NORMALIZATION_MODES = ["monthly_average", "fixed_rate", "none"] as const;
export const RECURRENCE_RULES = ["monthly"] as const;

export const NORMALIZATION_MODE_OPTIONS = [
  {
    value: "monthly_average",
    label: "Monthly average rate",
    description: "Use the average exchange rate for each month.",
  },
  {
    value: "fixed_rate",
    label: "Fixed exchange rate",
    description: "Use one exchange rate for this recurring amount.",
  },
  {
    value: "none",
    label: "No conversion preference",
    description: "Keep this recurring amount's original currency preference.",
  },
] as const satisfies ReadonlyArray<{
  value: NormalizationMode;
  label: string;
  description: string;
}>;

export type EventKind = (typeof EVENT_KINDS)[number];
export type NormalizationMode = (typeof NORMALIZATION_MODES)[number];
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number];
