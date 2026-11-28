import { and, eq, inArray } from "drizzle-orm";

import type { DbExecutor } from "@/db";
import { exchangeRateMonthly } from "@/db/schema";
import {
  INFER_ORIGINAL_CURRENCY_CANDIDATES,
  SEED_BOI_MONTHLY_AVERAGE_SOURCE,
  SEED_BOI_MONTHLY_AVERAGES,
} from "@/features/currency/seed-boi-monthly-averages";
import { normalizeAmountToWorkspaceCurrency } from "@/features/currency/normalize";
import type { CurrencyNormalizer } from "@/features/imports/types";
import { monthKey, startOfMonth, addMonths } from "@/lib/dates/months";

export const MISSING_MONTHLY_RATE_SOURCE = "missing-monthly-rate";

/**
 * Source recorded when a foreign-settled charge is converted with the latest
 * available monthly average because its own month has no seeded rate yet
 * (the month is still running, or the seed has not been updated).
 * The month the rate comes from is appended, e.g.
 * `provisional-monthly-rate:2026-10-01`. The row is an estimate: it is
 * included in workspace totals and repaired by the backfill once the real
 * rate for its month is seeded.
 */
export const PROVISIONAL_MONTHLY_RATE_SOURCE_PREFIX = "provisional-monthly-rate";

/** How far back the provisional fallback looks for a usable monthly rate. */
export const PROVISIONAL_RATE_MAX_MONTHS_BACK = 12;

export type CurrencyRateLookup = (
  baseCurrency: string,
  quoteCurrency: string,
  yearMonthFirstOfMonth: string,
) => number | null;

export type MonthlyRateMap = Map<string, number>;

function normalizeCurrencyCode(value?: string | null) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized.length === 3 ? normalized : null;
}

export function yearMonthFromTransactionDate(transactionDate: string) {
  return monthKey(startOfMonth(new Date(`${transactionDate.slice(0, 10)}T00:00:00.000Z`)));
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
  }>,
): MonthlyRateMap {
  const map: MonthlyRateMap = new Map();

  for (const row of rows) {
    const baseCurrency = normalizeCurrencyCode(row.baseCurrency);
    const quoteCurrency = normalizeCurrencyCode(row.quoteCurrency);
    const averageRate = Number(row.averageRate);

    if (!baseCurrency || !quoteCurrency || !Number.isFinite(averageRate) || averageRate <= 0) {
      continue;
    }

    map.set(
      monthlyRateMapKey(baseCurrency, quoteCurrency, row.yearMonth.slice(0, 10)),
      averageRate,
    );
  }

  return map;
}

export function createRateLookupFromMap(rates: MonthlyRateMap): CurrencyRateLookup {
  return (baseCurrency, quoteCurrency, yearMonthFirstOfMonth) => {
    const base = normalizeCurrencyCode(baseCurrency);
    const quote = normalizeCurrencyCode(quoteCurrency);

    if (!base || !quote) {
      return null;
    }

    if (base === quote) {
      return 1;
    }

    const direct = rates.get(monthlyRateMapKey(base, quote, yearMonthFirstOfMonth));
    if (direct && direct > 0) {
      return direct;
    }

    const inverse = rates.get(monthlyRateMapKey(quote, base, yearMonthFirstOfMonth));
    if (inverse && inverse > 0) {
      return 1 / inverse;
    }

    return null;
  };
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
): CurrencyNormalizer {
  const toCurrency = workspaceCurrency.trim().toUpperCase();

  return ({ amount, fromCurrency, transactionDate }) => {
    const from = normalizeCurrencyCode(fromCurrency) ?? fromCurrency.trim().toUpperCase();

    if (from === toCurrency) {
      return normalizeAmountToWorkspaceCurrency({
        amount,
        fromCurrency: from,
        toCurrency,
        monthlyAverageRate: 1,
        rateSource: "same-currency",
      });
    }

    const rate = rates(from, toCurrency, yearMonthFromTransactionDate(transactionDate));

    if (rate !== null && rate > 0) {
      return normalizeAmountToWorkspaceCurrency({
        amount,
        fromCurrency: from,
        toCurrency,
        monthlyAverageRate: rate,
        rateSource: `exchange-rate-monthly:${SEED_BOI_MONTHLY_AVERAGE_SOURCE}`,
      });
    }

    // No rate for the transaction's own month yet. Fall back to the latest
    // available monthly average (at most 12 months back) instead of
    // storing 0: the amount is an estimate, clearly labeled by its source,
    // and the backfill repairs it once the real rate is seeded.
    const transactionMonth = startOfMonth(
      new Date(`${transactionDate.slice(0, 10)}T00:00:00.000Z`),
    );

    for (let monthsBack = 1; monthsBack <= PROVISIONAL_RATE_MAX_MONTHS_BACK; monthsBack += 1) {
      const fallbackMonth = monthKey(addMonths(transactionMonth, -monthsBack));
      const fallbackRate = rates(from, toCurrency, fallbackMonth);

      if (fallbackRate !== null && fallbackRate > 0) {
        return normalizeAmountToWorkspaceCurrency({
          amount,
          fromCurrency: from,
          toCurrency,
          monthlyAverageRate: fallbackRate,
          rateSource: `${PROVISIONAL_MONTHLY_RATE_SOURCE_PREFIX}:${fallbackMonth}`,
        });
      }
    }

    return {
      normalizedAmount: 0,
      workspaceCurrency: toCurrency,
      normalizationRate: 0,
      normalizationRateSource: MISSING_MONTHLY_RATE_SOURCE,
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
      baseCurrency: exchangeRateMonthly.baseCurrency,
      quoteCurrency: exchangeRateMonthly.quoteCurrency,
      yearMonth: exchangeRateMonthly.yearMonth,
      averageRate: exchangeRateMonthly.averageRate,
    })
    .from(exchangeRateMonthly)
    .where(
      and(
        eq(exchangeRateMonthly.sourceName, SEED_BOI_MONTHLY_AVERAGE_SOURCE),
        inArray(exchangeRateMonthly.yearMonth, uniqueMonths),
      ),
    );

  return createMonthlyRateMap(
    rows.map((row) => ({
      ...row,
      yearMonth: row.yearMonth.slice(0, 10),
    })),
  );
}

/**
 * Load every seeded monthly average. The provisional fallback in
 * `createMonthlyAverageNormalizer` walks back to earlier months when the
 * transaction's own month has no rate yet, so import preview/save and the
 * backfill must have the full history in the map, not just the months in
 * the file being imported. The table is small (5 currencies x ~2 years).
 */
export async function loadAllSeededMonthlyRates(db: DbExecutor): Promise<MonthlyRateMap> {
  const rows = await db
    .select({
      baseCurrency: exchangeRateMonthly.baseCurrency,
      quoteCurrency: exchangeRateMonthly.quoteCurrency,
      yearMonth: exchangeRateMonthly.yearMonth,
      averageRate: exchangeRateMonthly.averageRate,
    })
    .from(exchangeRateMonthly)
    .where(eq(exchangeRateMonthly.sourceName, SEED_BOI_MONTHLY_AVERAGE_SOURCE));

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
    new Set(transactions.map((transaction) => yearMonthFromTransactionDate(transaction.transactionDate))),
  );
}

export { INFER_ORIGINAL_CURRENCY_CANDIDATES, SEED_BOI_MONTHLY_AVERAGE_SOURCE };
