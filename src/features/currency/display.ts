export type CurrencyNormalizationDisplayInput = {
  originalCurrency?: string | null;
  settlementCurrency?: string | null;
  workspaceCurrency?: string | null;
  normalizationRateSource?: string | null;
};

export type CurrencyNormalizationDisplayState = {
  isForeignCurrency: boolean;
  usesPlaceholderRate: boolean;
  label: string | null;
  tone: "neutral" | "warning";
  shortDescription: string | null;
  fullDescription: string | null;
};

function normalizeCurrencyCode(value?: string | null) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized.length === 3 ? normalized : null;
}

export function usesPlaceholderNormalizationRate(value?: string | null) {
  return value?.trim().toLowerCase().includes("placeholder") ?? false;
}

export function getCurrencyNormalizationDisplayState(
  input: CurrencyNormalizationDisplayInput,
): CurrencyNormalizationDisplayState {
  const originalCurrency = normalizeCurrencyCode(input.originalCurrency);
  const settlementCurrency = normalizeCurrencyCode(input.settlementCurrency);
  const workspaceCurrency = normalizeCurrencyCode(input.workspaceCurrency);
  const currencyFallback = workspaceCurrency ?? "the workspace currency";
  const isForeignCurrency = [originalCurrency, settlementCurrency].some(
    (currency) => currency && currency !== workspaceCurrency,
  );
  const usesPlaceholderRate =
    isForeignCurrency && usesPlaceholderNormalizationRate(input.normalizationRateSource);

  if (usesPlaceholderRate) {
    return {
      isForeignCurrency,
      usesPlaceholderRate,
      label: "Placeholder FX",
      tone: "warning",
      shortDescription: `Shown in ${currencyFallback} with placeholder FX.`,
      fullDescription: `This foreign-currency row is normalized into ${currencyFallback} with placeholder FX. Full multicurrency reporting is not finished yet.`,
    };
  }

  if (
    originalCurrency &&
    workspaceCurrency &&
    originalCurrency !== workspaceCurrency &&
    settlementCurrency === workspaceCurrency
  ) {
    return {
      isForeignCurrency,
      usesPlaceholderRate,
      label: "Foreign settled",
      tone: "neutral",
      shortDescription: `Original ${originalCurrency} charge, settled in ${workspaceCurrency}.`,
      fullDescription: `This row started in ${originalCurrency} and settled in ${workspaceCurrency}. Reports still use the workspace-currency amount while full multicurrency reporting is unfinished.`,
    };
  }

  if (isForeignCurrency) {
    return {
      isForeignCurrency,
      usesPlaceholderRate,
      label: "Foreign currency",
      tone: "neutral",
      shortDescription: `Shown in ${currencyFallback} for now.`,
      fullDescription: `This row uses foreign currency but is shown in ${currencyFallback} for now. Full multicurrency reporting is not finished yet.`,
    };
  }

  return {
    isForeignCurrency,
    usesPlaceholderRate,
    label: null,
    tone: "neutral",
    shortDescription: null,
    fullDescription: null,
  };
}
