import type {
  ParsedBankTransaction,
  ParsedBankStatement,
  TabularRow,
  WorkbookData,
} from "@/features/imports/types";
import {
  findFirstRowIndex,
  isEffectivelyEmptyRow,
  mapCurrencySymbol,
  normalizeRow,
  parseDate,
  parseNumber,
} from "@/features/imports/utils";

const HEADER_TITLE = "תאריך עסקה";

function parseCalRow(
  row: TabularRow,
  sectionName: string,
  sourceSheetName: string,
  sourceRowIndex: number,
): ParsedBankTransaction | undefined {
  const normalized = normalizeRow(row);
  const transactionDate = parseDate(row[0]);
  const merchantRaw = normalized[1];
  const category = normalized[2] || undefined;
  const cardLastFour = normalized[3] || undefined;
  const settlementAmount = parseNumber(row[5]);
  const settlementCurrency = mapCurrencySymbol(normalized[6]);
  const originalAmount = parseNumber(row[7]);
  const originalCurrency = mapCurrencySymbol(normalized[8] || normalized[6]);
  const bookingDate = parseDate(row[9]);
  const notes = normalized[10] || undefined;

  if (!transactionDate || !merchantRaw || settlementAmount === undefined) {
    return undefined;
  }

  const effectiveOriginalAmount = originalAmount ?? settlementAmount;
  const direction: "debit" | "credit" = settlementAmount < 0 ? "credit" : "debit";

  return {
    transactionDate,
    bookingDate,
    description: merchantRaw,
    merchantRaw,
    category,
    originalAmount: Math.abs(effectiveOriginalAmount),
    originalCurrency,
    settlementAmount: Math.abs(settlementAmount),
    settlementCurrency,
    statementSection: sectionName,
    notes,
    cardLastFour,
    sourceSheetName,
    sourceRowIndex,
    rawValues: normalized,
    direction,
  };
}

function parseCalSheet(
  rows: TabularRow[],
  sectionName: string,
): ParsedBankTransaction[] {
  const headerRowIndex = findFirstRowIndex(rows, (row) => row[0] === HEADER_TITLE);

  if (headerRowIndex === -1) {
    return [];
  }

  const transactions: ParsedBankTransaction[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (isEffectivelyEmptyRow(row)) {
      continue;
    }

    const parsed = parseCalRow(row, sectionName, sectionName, i);
    if (parsed) {
      transactions.push(parsed);
    }
  }

  return transactions;
}

export function parseCalWorkbook(workbook: WorkbookData): ParsedBankStatement {
  const transactions = workbook.sheets.flatMap((sheet) =>
    parseCalSheet(sheet.rows, sheet.name),
  );
  const primarySheet = workbook.sheets[0];

  return {
    templateId: "cal_card_export",
    accountLabel: normalizeRow(primarySheet.rows[1] ?? [])[0] || undefined,
    statementLabel: normalizeRow(primarySheet.rows[2] ?? [])[0] || undefined,
    transactions,
  };
}
