export type NormalizationInput = {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  monthlyAverageRate: number;
  rateSource: string;
};

export type NormalizedAmount = {
  originalAmount: number;
  originalCurrency: string;
  normalizedAmount: number;
  workspaceCurrency: string;
  normalizationRate: number;
  normalizationRateSource: string;
};

export function normalizeAmountToWorkspaceCurrency(
  input: NormalizationInput,
): NormalizedAmount {
  const { amount, fromCurrency, toCurrency, monthlyAverageRate, rateSource } = input;

  if (fromCurrency === toCurrency) {
    return {
      originalAmount: amount,
      originalCurrency: fromCurrency,
      normalizedAmount: amount,
      workspaceCurrency: toCurrency,
      normalizationRate: 1,
      normalizationRateSource: "same-currency",
    };
  }

  if (monthlyAverageRate <= 0) {
    throw new Error("Monthly average rate must be positive");
  }

  return {
    originalAmount: amount,
    originalCurrency: fromCurrency,
    normalizedAmount: Number((amount * monthlyAverageRate).toFixed(2)),
    workspaceCurrency: toCurrency,
    normalizationRate: monthlyAverageRate,
    normalizationRateSource: rateSource,
  };
}

