import { inferOriginalCurrency } from "@/features/currency/infer-original-currency";
import {
  createMonthlyAverageNormalizer,
  type CurrencyRateLookup,
  MISSING_MONTHLY_RATE_SOURCE,
  yearMonthFromTransactionDate,
} from "@/features/currency/monthly-rates";
import {
  amountsAreNearlyEqual,
  inferMaxSectionCurrency,
  isMaxInstallmentType,
} from "@/features/imports/templates/max-fx";

export type ImportedFxRow = {
  originalAmount: number;
  originalCurrency: string | null;
  settlementAmount: number | null;
  settlementCurrency: string | null;
  statementSection?: string | null;
  transactionDate: string;
  transactionType?: string | null;
  notes?: string | null;
  workspaceCurrency: string;
  normalizedAmount: number;
  normalizationRate: number | null;
  normalizationRateSource: string | null;
};

export type RecomputedImportedFx = {
  originalCurrency: string | null;
  settlementCurrency: string;
  normalizedAmount: number;
  normalizationRate: number;
  normalizationRateSource: string;
};

export function recomputeImportedFx(
  row: ImportedFxRow,
  rates: CurrencyRateLookup,
): RecomputedImportedFx {
  const workspaceCurrency = row.workspaceCurrency.trim().toUpperCase();
  const originalAmount = Number(row.originalAmount);
  const settlementAmount =
    row.settlementAmount === null || row.settlementAmount === undefined
      ? originalAmount
      : Number(row.settlementAmount);
  const sectionCurrency = inferMaxSectionCurrency(row.statementSection);
  const settlementCurrency = looksLikeMaxBillingSection(row.statementSection)
    ? sectionCurrency
    : (normalizeNullableCurrency(row.settlementCurrency) ?? sectionCurrency);
  const originalCurrency = resolveOriginalCurrency({
    originalAmount,
    settlementAmount,
    settlementCurrency,
    transactionDate: row.transactionDate,
    transactionType: row.transactionType,
    notes: row.notes,
    rates,
  });
  const normalized = createMonthlyAverageNormalizer(workspaceCurrency, rates)({
    amount: settlementAmount,
    fromCurrency: settlementCurrency,
    transactionDate: row.transactionDate,
  });

  return {
    originalCurrency,
    settlementCurrency,
    normalizedAmount: normalized.normalizedAmount,
    normalizationRate: normalized.normalizationRate,
    normalizationRateSource: normalized.normalizationRateSource,
  };
}

export function importedFxNeedsRewrite(row: ImportedFxRow, next: RecomputedImportedFx) {
  return (
    normalizeNullableCurrency(row.originalCurrency) !== next.originalCurrency ||
    normalizeNullableCurrency(row.settlementCurrency) !== next.settlementCurrency ||
    Number(row.normalizedAmount) !== next.normalizedAmount ||
    Number(row.normalizationRate ?? 0) !== next.normalizationRate ||
    (row.normalizationRateSource ?? "") !== next.normalizationRateSource
  );
}

export function recomputeImportedFxRows(rows: ImportedFxRow[], rates: CurrencyRateLookup) {
  let updatedCount = 0;
  const nextRows = rows.map((row) => {
    const next = recomputeImportedFx(row, rates);

    if (!importedFxNeedsRewrite(row, next)) {
      return row;
    }

    updatedCount += 1;
    return {
      ...row,
      ...next,
    };
  });

  return { rows: nextRows, updatedCount };
}

export function isMissingMonthlyRateSource(value?: string | null) {
  return value?.includes(MISSING_MONTHLY_RATE_SOURCE) ?? false;
}

export function isReportableFxNormalizedSpend(input: {
  normalizationRateSource?: string | null;
}) {
  return !isMissingMonthlyRateSource(input.normalizationRateSource);
}

export function collectBackfillYearMonths(rows: Array<{ transactionDate: string }>) {
  return Array.from(
    new Set(rows.map((row) => yearMonthFromTransactionDate(row.transactionDate))),
  );
}

function resolveOriginalCurrency(input: {
  originalAmount: number;
  settlementAmount: number;
  settlementCurrency: string;
  transactionDate: string;
  transactionType?: string | null;
  notes?: string | null;
  rates: CurrencyRateLookup;
}) {
  if (isMaxInstallmentType(input.transactionType) || isMaxInstallmentType(input.notes)) {
    return input.settlementCurrency;
  }

  if (amountsAreNearlyEqual(input.originalAmount, input.settlementAmount)) {
    return input.settlementCurrency;
  }

  return inferOriginalCurrency({
    originalAmount: input.originalAmount,
    settlementAmount: input.settlementAmount,
    settlementCurrency: input.settlementCurrency,
    transactionDate: input.transactionDate,
    rates: input.rates,
  });
}

function looksLikeMaxBillingSection(section?: string | null) {
  if (!section) {
    return false;
  }

  return (
    section.includes("עסקאות שחויבו") ||
    section.includes("דולר") ||
    section.includes("אירו") ||
    section.includes("יורו") ||
    section.includes("ליש\"ט") ||
    section.includes("סטרלינג")
  );
}

function normalizeNullableCurrency(value?: string | null) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized.length === 3 ? normalized : null;
}
