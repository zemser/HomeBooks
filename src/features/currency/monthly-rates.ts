import { and, asc, eq, inArray, like, or, sql } from "drizzle-orm";

import type { DbExecutor } from "@/db";
import { BOI_MONTHLY_SOURCE_PREFIX } from "@/features/currency/rate-keys";
import {
  type ValuationPolicy,
  type ValuationState,
  exchangeRateMonthly,
} from "@/db/schema";
import {
  INFER_ORIGINAL_CURRENCY_CANDIDATES,
  SEED_BOI_MONTHLY_AVERAGE_SOURCE,
  SEED_BOI_MONTHLY_AVERAGES,
} from "@/features/currency/seed-boi-monthly-averages";
import { normalizeAmountToWorkspaceCurrency } from "@/features/currency/normalize";
import type { CurrencyNormalizer } from "@/features/imports/types";
import { addMonths, monthKey, startOfMonth } from "@/lib/dates/months";

import { MISSING_MONTHLY_RATE_SOURCE } from "./valuation-status";
export { MISSING_MONTHLY_RATE_SOURCE } from "./valuation-status";

type RateSnapshot = { rate: number; id?: string; source?: string };

export type CurrencyRateLookup = ((
  baseCurrency: string,
  quoteCurrency: string,
  yearMonthFirstOfMonth: string,
) => number | null) & {
  snapshot?: (
    base: string,
    quote: string,
    month: string,
  ) => RateSnapshot | undefined;
};

export type MonthlyRateMap = Map<string, number | RateSnapshot>;

function normalizeCurrencyCode(value?: string | null) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized.length === 3 ? normalized : null;
}

export function yearMonthFromTransactionDate(transactionDate: string) {
  return monthKey(
    startOfMonth(new Date(`${transactionDate.slice(0, 10)}T00:00:00.000Z`)),
  );
}

export function previousMonthFromTransactionDate(transactionDate: string) {
  return monthKey(
    addMonths(new Date(`${transactionDate.slice(0, 10)}T00:00:00.000Z`), -1),
  );
}

export function monthlyRateMapKey(
  baseCurrency: string,
  quoteCurrency: string,
  yearMonthFirstOfMonth: string,
) {
  return `${baseCurrency}|${quoteCurrency}|${yearMonthFirstOfMonth}`;
}

export function createMonthlyRateMap(
  rows: Array<{
    baseCurrency: string;
    quoteCurrency: string;
    yearMonth: string;
    averageRate: number | string;
    id?: string;
    sourceName?: string;
  }>,
): MonthlyRateMap {
  const map: MonthlyRateMap = new Map();

  for (const row of rows) {
    const baseCurrency = normalizeCurrencyCode(row.baseCurrency);
    const quoteCurrency = normalizeCurrencyCode(row.quoteCurrency);
    const averageRate = Number(row.averageRate);

    if (
      !baseCurrency ||
      !quoteCurrency ||
      !Number.isFinite(averageRate) ||
      averageRate <= 0
    ) {
      continue;
    }

    map.set(
      monthlyRateMapKey(
        baseCurrency,
        quoteCurrency,
        row.yearMonth.slice(0, 10),
      ),
      { rate: averageRate, id: row.id, source: row.sourceName },
    );
  }

  return map;
}

export function createRateLookupFromMap(
  rates: MonthlyRateMap,
): CurrencyRateLookup {
  function snapshot(
    baseCurrency: string,
    quoteCurrency: string,
    month: string,
  ) {
    const base = normalizeCurrencyCode(baseCurrency);
    const quote = normalizeCurrencyCode(quoteCurrency);
    if (!base || !quote) return undefined;
    if (base === quote) return { rate: 1 };
    const direct = rates.get(monthlyRateMapKey(base, quote, month));
    const stored = direct ?? rates.get(monthlyRateMapKey(quote, base, month));
    if (stored === undefined) return undefined;
    const data = typeof stored === "number" ? { rate: stored } : stored;
    return { ...data, rate: direct === undefined ? 1 / data.rate : data.rate };
  }

  return Object.assign(
    (base: string, quote: string, month: string) =>
      snapshot(base, quote, month)?.rate ?? null,
    { snapshot },
  );
}

export function createSeededRateLookup(
  rows: Array<{
    baseCurrency: string;
    quoteCurrency: string;
    yearMonth: string;
    averageRate: number | string;
  }> = SEED_BOI_MONTHLY_AVERAGES,
): CurrencyRateLookup {
  return createRateLookupFromMap(createMonthlyRateMap(rows));
}

export function createMonthlyAverageNormalizer(
  workspaceCurrency: string,
  rates: CurrencyRateLookup,
  valuationPolicy: ValuationPolicy = "legacy",
) {
  const toCurrency = workspaceCurrency.trim().toUpperCase();

  type Valuation = ReturnType<CurrencyNormalizer> & {
    valuationPolicy: ValuationPolicy;
    valuationState: ValuationState;
    referenceMonth: string | null;
    exchangeRateId: string | null;
  };
  return ({
    amount,
    fromCurrency,
    transactionDate,
  }: Parameters<CurrencyNormalizer>[0]): Valuation => {
    const from =
      normalizeCurrencyCode(fromCurrency) ?? fromCurrency.trim().toUpperCase();

    if (from === toCurrency) {
      return {
        ...normalizeAmountToWorkspaceCurrency({
          amount,
          fromCurrency: from,
          toCurrency,
          monthlyAverageRate: 1,
          rateSource: "same-currency",
        }),
        valuationPolicy,
        valuationState: "recorded",
        referenceMonth: null,
        exchangeRateId: null,
      };
    }

    if (
      valuationPolicy === "previous-month-v1" &&
      amount === 0 &&
      /^[A-Z]{3}$/.test(from)
    ) {
      return {
        normalizedAmount: 0,
        workspaceCurrency: toCurrency,
        normalizationRate: 0,
        normalizationRateSource: "zero-settlement",
        valuationPolicy,
        valuationState: "recorded",
        referenceMonth: null,
        exchangeRateId: null,
      };
    }

    const referenceMonth =
      valuationPolicy === "previous-month-v1"
        ? previousMonthFromTransactionDate(transactionDate)
        : yearMonthFromTransactionDate(transactionDate);
    const snapshot = rates.snapshot?.(from, toCurrency, referenceMonth);
    const rate = snapshot?.rate ?? rates(from, toCurrency, referenceMonth);

    if (rate === null || !Number.isFinite(rate) || rate <= 0) {
      return {
        valuationPolicy,
        valuationState: "pending",
        referenceMonth,
        exchangeRateId: null,
        normalizedAmount: 0,
        workspaceCurrency: toCurrency,
        normalizationRate: 0,
        normalizationRateSource: MISSING_MONTHLY_RATE_SOURCE,
      };
    }

    return {
      ...normalizeAmountToWorkspaceCurrency({
        amount,
        fromCurrency: from,
        toCurrency,
        monthlyAverageRate: rate,
        rateSource: `exchange-rate-monthly:${snapshot?.source ?? SEED_BOI_MONTHLY_AVERAGE_SOURCE}`,
      }),
      valuationPolicy,
      valuationState: valuationPolicy === "legacy" ? "legacy" : "converted",
      referenceMonth,
      exchangeRateId: snapshot?.id ?? null,
    };
  };
}

export async function loadSeededMonthlyRates(
  db: DbExecutor,
  yearMonths: string[],
): Promise<MonthlyRateMap> {
  const uniqueMonths = Array.from(
    new Set(yearMonths.map((value) => value.slice(0, 10)).filter(Boolean)),
  );

  if (uniqueMonths.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      id: exchangeRateMonthly.id,
      sourceName: exchangeRateMonthly.sourceName,
      baseCurrency: exchangeRateMonthly.baseCurrency,
      quoteCurrency: exchangeRateMonthly.quoteCurrency,
      yearMonth: exchangeRateMonthly.yearMonth,
      averageRate: exchangeRateMonthly.averageRate,
    })
    .from(exchangeRateMonthly)
    .where(
      and(
        or(
          eq(exchangeRateMonthly.sourceName, SEED_BOI_MONTHLY_AVERAGE_SOURCE),
          like(exchangeRateMonthly.sourceName, `${BOI_MONTHLY_SOURCE_PREFIX}%`),
        ),
        inArray(exchangeRateMonthly.yearMonth, uniqueMonths),
      ),
    )
    .orderBy(
      sql`CASE WHEN ${exchangeRateMonthly.sourceName} = ${SEED_BOI_MONTHLY_AVERAGE_SOURCE} THEN 0 ELSE 1 END`,
      asc(exchangeRateMonthly.fetchedAt),
      asc(exchangeRateMonthly.id),
    );

  return createMonthlyRateMap(
    rows.map((row) => ({
      ...row,
      yearMonth: row.yearMonth.slice(0, 10),
    })),
  );
}

export function collectInferenceYearMonths(
  transactions: Array<{ transactionDate: string }>,
) {
  return Array.from(
    new Set(
      transactions.map((transaction) =>
        yearMonthFromTransactionDate(transaction.transactionDate),
      ),
    ),
  );
}

export { INFER_ORIGINAL_CURRENCY_CANDIDATES, SEED_BOI_MONTHLY_AVERAGE_SOURCE };
