import { normalizeAmountToWorkspaceCurrency } from "@/features/currency/normalize";
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

function defaultCurrencyNormalizer(workspaceCurrency: string): CurrencyNormalizer {
  return ({ amount, fromCurrency }) =>
    normalizeAmountToWorkspaceCurrency({
      amount,
      fromCurrency,
      toCurrency: workspaceCurrency,
      monthlyAverageRate: 1,
      rateSource: "preview-placeholder-rate-1",
    });
}

function parseByTemplate(workbook: WorkbookData): ParsedBankStatement {
  const detected = detectBankTemplate(workbook);

  switch (detected.id) {
    case "max_credit_statement":
      return parseMaxWorkbook(workbook);
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
): NormalizedTransactionPreview {
  const normalized = normalizeCurrency({
    amount: transaction.settlementAmount ?? transaction.originalAmount,
    fromCurrency: transaction.settlementCurrency ?? transaction.originalCurrency,
    transactionDate: transaction.transactionDate,
  });

  return {
    transactionDate: transaction.transactionDate,
    bookingDate: transaction.bookingDate,
    description: transaction.description,
    merchantRaw: transaction.merchantRaw,
    category: transaction.category,
    originalAmount: transaction.originalAmount,
    originalCurrency: transaction.originalCurrency,
    settlementAmount: transaction.settlementAmount,
    settlementCurrency: transaction.settlementCurrency,
    statementSection: transaction.statementSection,
    notes: transaction.notes,
    cardLastFour: transaction.cardLastFour,
    direction: transaction.direction,
    normalizedAmount: normalized.normalizedAmount,
    workspaceCurrency: normalized.workspaceCurrency,
    normalizationRate: normalized.normalizationRate,
    normalizationRateSource: normalized.normalizationRateSource,
  };
}

export function parseBankWorkbookToPreview(input: {
  workbook: WorkbookData;
  workspaceCurrency: string;
  currencyNormalizer?: CurrencyNormalizer;
}): {
  parsed: ParsedBankStatement;
  previewTransactions: NormalizedTransactionPreview[];
} {
  const parsed = parseByTemplate(input.workbook);
  const normalizeCurrency =
    input.currencyNormalizer ?? defaultCurrencyNormalizer(input.workspaceCurrency);
  const previewTransactions = parsed.transactions.map((transaction) =>
    toPreviewTransaction(transaction, normalizeCurrency),
  );

  return {
    parsed,
    previewTransactions,
  };
}
