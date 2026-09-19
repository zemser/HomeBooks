import {
  type CurrencyRateLookup,
  yearMonthFromTransactionDate,
} from "@/features/currency/monthly-rates";
import { INFER_ORIGINAL_CURRENCY_CANDIDATES } from "@/features/currency/seed-boi-monthly-averages";

const ILS_MARKUP_MIN = 0.95;
const ILS_MARKUP_MAX = 1.2;
const JPY_PER_USD_MIN = 130;
const JPY_PER_USD_MAX = 170;
const CHF_PER_EUR_MIN = 1.02;
const CHF_PER_EUR_MAX = 1.15;
const USD_PER_EUR_MIN = 1.05;
const USD_PER_EUR_MAX = 1.25;

export type InferOriginalCurrencyInput = {
  originalAmount: number;
  settlementAmount: number;
  settlementCurrency: string;
  transactionDate: string;
  rates: CurrencyRateLookup;
};

function absRatio(numerator: number, denominator: number) {
  if (denominator === 0) {
    return null;
  }

  return Math.abs(numerator / denominator);
}

export function inferOriginalCurrency(input: InferOriginalCurrencyInput): string | null {
  const settlementCurrency = input.settlementCurrency.trim().toUpperCase();
  const implied = absRatio(input.settlementAmount, input.originalAmount);
  const inverse = absRatio(input.originalAmount, input.settlementAmount);

  if (implied === null || inverse === null) {
    return null;
  }

  if (settlementCurrency === "ILS") {
    return inferOriginalWhenSettledInIls({
      implied,
      transactionDate: input.transactionDate,
      rates: input.rates,
    });
  }

  if (settlementCurrency === "USD") {
    if (inverse >= JPY_PER_USD_MIN && inverse <= JPY_PER_USD_MAX) {
      return "JPY";
    }

    return null;
  }

  if (settlementCurrency === "EUR") {
    if (implied >= CHF_PER_EUR_MIN && implied <= CHF_PER_EUR_MAX) {
      return "CHF";
    }

    if (inverse >= USD_PER_EUR_MIN && inverse <= USD_PER_EUR_MAX) {
      return "USD";
    }

    return null;
  }

  return null;
}

function inferOriginalWhenSettledInIls(input: {
  implied: number;
  transactionDate: string;
  rates: CurrencyRateLookup;
}) {
  const yearMonth = yearMonthFromTransactionDate(input.transactionDate);
  let best: { currency: string; distance: number } | null = null;

  for (const candidate of INFER_ORIGINAL_CURRENCY_CANDIDATES) {
    const official = input.rates(candidate, "ILS", yearMonth);

    if (official === null || official <= 0) {
      continue;
    }

    const markup = input.implied / official;

    if (markup < ILS_MARKUP_MIN || markup > ILS_MARKUP_MAX) {
      continue;
    }

    const distance = Math.abs(markup - 1);

    if (!best || distance < best.distance) {
      best = { currency: candidate, distance };
    }
  }

  return best?.currency ?? null;
}
