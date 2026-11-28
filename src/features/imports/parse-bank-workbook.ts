import {
  collectInferenceYearMonths,
  createMonthlyAverageNormalizer,
  createRateLookupFromMap,
  loadSeededMonthlyRates,
  previousMonthFromTransactionDate,
  type CurrencyRateLookup,
} from "@/features/currency/monthly-rates";
import { requestMissingFxRates } from "@/features/currency/rate-requests";
import type { ValuationPolicy } from "@/db/schema";
import { parseCalWorkbook } from "@/features/imports/templates/cal";
import { parseCalRecentTransactionsWorkbook } from "@/features/imports/templates/cal-recent-transactions";
import { detectBankTemplate } from "@/features/imports/templates/detect";
import { parseMaxWorkbook } from "@/features/imports/templates/max";
import type {
  CurrencyNormalizer,
  NormalizedTransactionPreview,
  ParsedBankTransaction,
  ParsedBankStatement,
  WorkbookData,
} from "@/features/imports/types";
import type { DbExecutor } from "@/db";

function parseByTemplate(
  workbook: WorkbookData,
  rates?: CurrencyRateLookup,
): ParsedBankStatement {
  const detected = detectBankTemplate(workbook);

  switch (detected.id) {
    case "max_credit_statement":
      return parseMaxWorkbook(workbook, rates);
    case "cal_card_export":
      return parseCalWorkbook(workbook);
    case "cal_recent_transactions_report":
      return parseCalRecentTransactionsWorkbook(workbook);
    default:
      throw new Error(detected.reason);
  }
}

function toPreviewTransaction(
  transaction: ParsedBankTransaction,
  normalizeCurrency: CurrencyNormalizer,
  policy: ValuationPolicy,
  workspaceCurrency: string,
): NormalizedTransactionPreview {
  const postedAmount =
    policy === "previous-month-v1"
      ? transaction.postedAmounts?.[workspaceCurrency]
      : undefined;
  const hasSettlement =
    transaction.settlementAmount !== undefined &&
    !!transaction.settlementCurrency;
  const fromCurrency =
    policy === "previous-month-v1" && !hasSettlement
      ? ""
      : (transaction.settlementCurrency ?? transaction.originalCurrency ?? "");
  const normalized = normalizeCurrency({
    amount:
      postedAmount ??
      transaction.settlementAmount ??
      transaction.originalAmount,
    fromCurrency: postedAmount !== undefined ? workspaceCurrency : fromCurrency,
    transactionDate: transaction.transactionDate,
  });

  const bankConversion =
    postedAmount !== undefined &&
    transaction.settlementCurrency !== workspaceCurrency;
  return {
    transactionDate: transaction.transactionDate,
    bookingDate: transaction.bookingDate,
    description: transaction.description,
    merchantRaw: transaction.merchantRaw,
    category: transaction.category,
    settlementAmount: transaction.settlementAmount,
    settlementCurrency: transaction.settlementCurrency,
    statementSection: transaction.statementSection,
    notes: transaction.notes,
    cardLastFour: transaction.cardLastFour,
    direction: transaction.direction,
    ...normalized,
    originalAmount: transaction.originalAmount,
    originalCurrency: transaction.originalCurrency,
    workspaceCurrency: normalized.workspaceCurrency,
    normalizationRate:
      bankConversion && transaction.settlementAmount
        ? Number((postedAmount / transaction.settlementAmount).toFixed(8))
        : normalized.normalizationRate,
    normalizationRateSource: bankConversion
      ? "bank-posted-workspace"
      : normalized.normalizationRateSource,
  };
}

export function parseBankWorkbookToPreview(input: {
  workbook: WorkbookData;
  workspaceCurrency: string;
  currencyNormalizer?: CurrencyNormalizer;
  rates?: CurrencyRateLookup;
  policy?: ValuationPolicy;
}): {
  parsed: ParsedBankStatement;
  previewTransactions: NormalizedTransactionPreview[];
} {
  const parsed = parseByTemplate(input.workbook, input.rates);
  const normalizeCurrency =
    input.currencyNormalizer ??
    createMonthlyAverageNormalizer(
      input.workspaceCurrency,
      input.rates ?? (() => null),
      input.policy,
    );
  const previewTransactions = parsed.transactions.map((transaction) =>
    toPreviewTransaction(
      transaction,
      normalizeCurrency,
      input.policy ?? "legacy",
      input.workspaceCurrency,
    ),
  );

  return {
    parsed,
    previewTransactions,
  };
}

export function collectWorkbookRateMonths(workbook: WorkbookData) {
  return collectInferenceYearMonths(parseByTemplate(workbook).transactions);
}

export async function parseBankWorkbookWithMonthlyRates(input: {
  workbook: WorkbookData;
  workspaceCurrency: string;
  db: DbExecutor;
  policy?: ValuationPolicy;
}) {
  const months = collectWorkbookRateMonths(input.workbook);
  const rateMap = await loadSeededMonthlyRates(
    input.db,
    input.policy === "previous-month-v1"
      ? [...months, ...months.map(previousMonthFromTransactionDate)]
      : months,
  );
  const rates = createRateLookupFromMap(rateMap);

  const preview = parseBankWorkbookToPreview({
    workbook: input.workbook,
    workspaceCurrency: input.workspaceCurrency,
    rates,
    policy: input.policy,
  });
  if (input.policy === "previous-month-v1") {
    await requestMissingFxRates(
      input.db,
      preview.previewTransactions.flatMap((row) =>
        row.valuationState === "pending" &&
        row.settlementCurrency &&
        row.settlementAmount !== undefined &&
        row.referenceMonth
          ? [
              {
                baseCurrency: row.settlementCurrency,
                quoteCurrency: row.workspaceCurrency,
                yearMonth: row.referenceMonth,
              },
            ]
          : [],
      ),
    );
  }
  return preview;
}
