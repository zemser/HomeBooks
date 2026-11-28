export const MISSING_MONTHLY_RATE_SOURCE = "missing-monthly-rate";

export function isMissingMonthlyRateSource(value?: string | null) {
  return value?.includes(MISSING_MONTHLY_RATE_SOURCE) ?? false;
}

export function isReportableFxNormalizedSpend(input: {
  valuationState?: string | null;
  normalizationRateSource?: string | null;
}) {
  return input.valuationState !== "pending" && !isMissingMonthlyRateSource(input.normalizationRateSource);
}
