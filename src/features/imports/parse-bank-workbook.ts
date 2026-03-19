import { normalizeAmountToWorkspaceCurrency } from "@/features/currency/normalize";
import { detectBankTemplate } from "@/features/imports/templates/detect";
import { parseDiscountWorkbook } from "@/features/imports/templates/discount";
import { parseFibiBankWorkbook } from "@/features/imports/templates/fibi";
import type {
  CurrencyNormalizer,
  NormalizedTransactionPreview,
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
      rateSource: "default-placeholder",
    });
}

function parseByTemplate(workbook: WorkbookData): ParsedBankStatement {
  const detected = detectBankTemplate(workbook);

  switch (detected.id) {
    case "fibi_credit_statement":
      return parseFibiBankWorkbook(workbook);
    case "discount_card_export":
      return parseDiscountWorkbook(workbook);
    default:
      throw new Error(detected.reason);
  }
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

  const previewTransactions = parsed.transactions.map((transaction) => {
    const normalized = normalizeCurrency({
      amount: transaction.settlementAmount ?? transaction.originalAmount,
      fromCurrency: transaction.settlementCurrency ?? transaction.originalCurrency,
      transactionDate: transaction.transactionDate,
    });

    return {
      ...transaction,
      normalizedAmount: normalized.normalizedAmount,
      workspaceCurrency: normalized.workspaceCurrency,
      normalizationRate: normalized.normalizationRate,
      normalizationRateSource: normalized.normalizationRateSource,
    };
  });

  return {
    parsed,
    previewTransactions,
  };
}
