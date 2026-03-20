import type {
  ParsedBankTransaction,
  ParsedBankStatement,
  TabularRow,
  WorkbookData,
} from "@/features/imports/types";
import {
  findFirstRowIndex,
  isEffectivelyEmptyRow,
  normalizeRow,
  parseDate,
  parseNumber,
} from "@/features/imports/utils";

const HEADER_TITLE = "תאריך\nעסקה";

function extractOriginalCurrencyFromNotes(notes: string | undefined): string | undefined {
  if (!notes) {
    return undefined;
  }

  const match = notes.match(/([A-Z$€]{1,3})$/);

  if (!match) {
    return undefined;
  }

  const currency = match[1];

  if (currency === "$") {
    return "USD";
  }

  if (currency === "€") {
    return "EUR";
  }

  return currency;
}

function extractOriginalAmountFromNotes(notes: string | undefined): number | undefined {
  if (!notes) {
    return undefined;
  }

  const match = notes.match(/הוא\s+([0-9.]+)/);
  return match ? Number(match[1]) : undefined;
}

function parseRecentTransactionRow(
  row: TabularRow,
  sourceSheetName: string,
  sourceRowIndex: number,
): ParsedBankTransaction | undefined {
  const normalized = normalizeRow(row);
  const transactionDate = parseDate(row[0]);
  const merchantRaw = normalized[1];
  const amountIls = parseNumber(row[2]);
  const hasEuroColumn = normalized.includes("סכום\nביורו") || row.length >= 8;
  const amountEuro = hasEuroColumn ? parseNumber(row[3]) : undefined;
  const bookingDate = parseDate(row[hasEuroColumn ? 4 : 3]);
  const notes = normalized[hasEuroColumn ? 7 : 6] || undefined;

  if (!transactionDate || !merchantRaw) {
    return undefined;
  }

  const settlementAmount = amountEuro ?? amountIls;

  if (settlementAmount === undefined) {
    return undefined;
  }

  const notesCurrency = extractOriginalCurrencyFromNotes(notes);
  const notesAmount = extractOriginalAmountFromNotes(notes);
  const settlementCurrency = amountEuro !== undefined ? "EUR" : "ILS";
  const originalCurrency = notesCurrency ?? settlementCurrency;
  const originalAmount = notesAmount ?? settlementAmount;
  const direction: "debit" | "credit" = settlementAmount < 0 ? "credit" : "debit";

  return {
    transactionDate,
    bookingDate,
    description: merchantRaw,
    merchantRaw,
    originalAmount: Math.abs(originalAmount),
    originalCurrency,
    settlementAmount: Math.abs(settlementAmount),
    settlementCurrency,
    notes,
    sourceSheetName,
    sourceRowIndex,
    rawValues: normalized,
    direction,
  };
}

export function parseCalRecentTransactionsWorkbook(workbook: WorkbookData): ParsedBankStatement {
  const sheet = workbook.sheets[0];
  const headerRowIndex = findFirstRowIndex(sheet.rows, (row) => row[0] === HEADER_TITLE);

  if (headerRowIndex === -1) {
    throw new Error("Could not find the recent transactions report header row");
  }

  const transactions: ParsedBankTransaction[] = [];

  for (let i = headerRowIndex + 1; i < sheet.rows.length; i += 1) {
    const row = sheet.rows[i];

    if (isEffectivelyEmptyRow(row)) {
      continue;
    }

    const parsed = parseRecentTransactionRow(row, sheet.name, i);
    if (parsed) {
      transactions.push(parsed);
    }
  }

  return {
    templateId: "cal_recent_transactions_report",
    accountLabel: normalizeRow(sheet.rows[0])[0] || undefined,
    statementLabel: sheet.name,
    transactions,
  };
}
