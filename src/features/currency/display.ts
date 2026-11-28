import { PROVISIONAL_MONTHLY_RATE_SOURCE_PREFIX } from "@/features/currency/monthly-rates";
import { formatYearMonthLabel } from "@/lib/dates/months";
import { formatMoneyNumber } from "@/lib/money/format";

export type CurrencyNormalizationDisplayInput = {
  originalCurrency?: string | null;
  settlementCurrency?: string | null;
  settlementAmount?: number | string | null;
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
  const source = value?.trim().toLowerCase() ?? "";
  return source.includes("placeholder") || source.includes("missing-monthly-rate");
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
  const source = input.normalizationRateSource?.trim() ?? "";
  const numericSettlementAmount = Number(input.settlementAmount);
  const usesPlaceholderRate = usesPlaceholderNormalizationRate(source);
  const settlementAmountLabel =
    input.settlementAmount !== null &&
    input.settlementAmount !== undefined &&
    input.settlementAmount !== "" &&
    Number.isFinite(numericSettlementAmount)
      ? formatMoneyNumber(numericSettlementAmount)
      : null;

  if (
    originalCurrency &&
    workspaceCurrency &&
    originalCurrency !== workspaceCurrency &&
    settlementCurrency === workspaceCurrency &&
    !usesPlaceholderRate
  ) {
    const settlementCopy = settlementAmountLabel
      ? `${settlementAmountLabel} ${workspaceCurrency}`
      : workspaceCurrency;

    return {
      isForeignCurrency,
      usesPlaceholderRate: false,
      label: "Foreign settled",
      tone: "neutral",
      shortDescription: `Original ${originalCurrency} charge, settled in ${workspaceCurrency}. Month totals use ${settlementCopy}.`,
      fullDescription: `Original ${originalCurrency} charge, settled in ${workspaceCurrency}. Month totals use ${settlementCopy}.`,
    };
  }

  if (
    settlementCurrency &&
    workspaceCurrency &&
    settlementCurrency !== workspaceCurrency &&
    source.startsWith(`${PROVISIONAL_MONTHLY_RATE_SOURCE_PREFIX}:`)
  ) {
    const chargedCopy = settlementAmountLabel
      ? `${settlementAmountLabel} ${settlementCurrency}`
      : settlementCurrency;
    const rateMonth = source.slice(PROVISIONAL_MONTHLY_RATE_SOURCE_PREFIX.length + 1);
    const rateMonthLabel = /^\d{4}-\d{2}-01$/.test(rateMonth)
      ? formatYearMonthLabel(rateMonth)
      : "the latest available month";

    return {
      isForeignCurrency,
      usesPlaceholderRate: false,
      label: "Estimated FX",
      tone: "warning",
      shortDescription: `Charged ${chargedCopy}, shown in ${workspaceCurrency} at the ${rateMonthLabel} monthly average. Estimate until this month's rate is added.`,
      fullDescription: `Charged ${chargedCopy}, shown in ${workspaceCurrency} at the ${rateMonthLabel} monthly average. This is an estimate: it is included in ${workspaceCurrency} totals and will be corrected automatically once the rate for this transaction's month is added.`,
    };
  }

  if (
    settlementCurrency &&
    workspaceCurrency &&
    settlementCurrency !== workspaceCurrency &&
    source.startsWith("exchange-rate-monthly")
  ) {
    const chargedCopy = settlementAmountLabel
      ? `${settlementAmountLabel} ${settlementCurrency}`
      : settlementCurrency;

    return {
      isForeignCurrency,
      usesPlaceholderRate: false,
      label: "Converted",
      tone: "neutral",
      shortDescription: `Charged ${chargedCopy}, shown in ${workspaceCurrency} at monthly average.`,
      fullDescription: `Charged ${chargedCopy}, shown in ${workspaceCurrency} at monthly average.`,
    };
  }

  if (usesPlaceholderRate) {
    return {
      isForeignCurrency,
      usesPlaceholderRate: true,
      label: "Placeholder FX",
      tone: "warning",
      shortDescription: `Shown in ${currencyFallback} with placeholder FX.`,
      fullDescription: `This row is waiting on a monthly average rate. It is flagged Placeholder FX and excluded from ${currencyFallback} totals until a rate exists.`,
    };
  }

  return {
    isForeignCurrency,
    usesPlaceholderRate: false,
    label: null,
    tone: "neutral",
    shortDescription: null,
    fullDescription: null,
  };
}
