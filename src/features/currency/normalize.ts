import Big from "big.js";

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

  // The stored rate and the rate used to value the charge must agree.
  const appliedRate = new Big(monthlyAverageRate).round(8, Big.roundHalfUp);
  return {
    originalAmount: amount,
    originalCurrency: fromCurrency,
    normalizedAmount: new Big(amount).times(appliedRate).round(2, Big.roundHalfUp).toNumber(),
    workspaceCurrency: toCurrency,
    normalizationRate: appliedRate.toNumber(),
    normalizationRateSource: rateSource,
  };
}

