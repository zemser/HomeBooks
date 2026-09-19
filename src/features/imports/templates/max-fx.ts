import { inferOriginalCurrency } from "@/features/currency/infer-original-currency";
import type { CurrencyRateLookup } from "@/features/currency/monthly-rates";

const NEARLY_EQUAL_RATIO = 0.06;

export function inferMaxSectionCurrency(sectionLabel: string | undefined | null): string {
  if (!sectionLabel) {
    return "ILS";
  }

  if (sectionLabel.includes("דולר")) {
    return "USD";
  }

  if (sectionLabel.includes("אירו") || sectionLabel.includes("יורו")) {
    return "EUR";
  }

  if (
    sectionLabel.includes("ליש\"ט") ||
    sectionLabel.includes("סטרלינג") ||
    sectionLabel.toUpperCase().includes("GBP")
  ) {
    return "GBP";
  }

  return "ILS";
}

export function isMaxInstallmentType(value?: string | null) {
  return Boolean(value?.includes("תשלומים"));
}

export function amountsAreNearlyEqual(left: number, right: number) {
  if (left === right) {
    return true;
  }

  const denominator = Math.max(Math.abs(left), Math.abs(right));
  if (denominator === 0) {
    return true;
  }

  return Math.abs(left - right) / denominator <= NEARLY_EQUAL_RATIO;
}

export function resolveMaxTransactionCurrencies(input: {
  originalAmount: number;
  settlementAmount: number;
  sectionCurrency: string;
  transactionDate: string;
  transactionType?: string | null;
  rates?: CurrencyRateLookup;
}): { originalCurrency: string | null; settlementCurrency: string } {
  const settlementCurrency = input.sectionCurrency;

  if (
    isMaxInstallmentType(input.transactionType) ||
    amountsAreNearlyEqual(input.originalAmount, input.settlementAmount)
  ) {
    return {
      originalCurrency: settlementCurrency,
      settlementCurrency,
    };
  }

  if (!input.rates) {
    return {
      originalCurrency: null,
      settlementCurrency,
    };
  }

  return {
    originalCurrency: inferOriginalCurrency({
      originalAmount: input.originalAmount,
      settlementAmount: input.settlementAmount,
      settlementCurrency,
      transactionDate: input.transactionDate,
      rates: input.rates,
    }),
    settlementCurrency,
  };
}
