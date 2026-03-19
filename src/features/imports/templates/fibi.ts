import type {
  NormalizedBankTransaction,
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

function inferSectionCurrency(sectionLabel: string | undefined): string {
  if (!sectionLabel) {
    return "ILS";
  }

  if (sectionLabel.includes("דולר")) {
    return "USD";
  }

  if (sectionLabel.includes("יורו")) {
    return "EUR";
  }

  return "ILS";
}

function parseTransactionRow(
  row: TabularRow,
  sectionName: string | undefined,
): NormalizedBankTransaction | undefined {
  const transactionDate = parseDate(row[0]);
  const merchantRaw = normalizeRow(row)[1];
  const originalAmount = parseNumber(row[2]);
  const settlementAmount = parseNumber(row[3]);
  const category = normalizeRow(row)[5] || undefined;
  const notes = normalizeRow(row)[6] || undefined;

  if (!transactionDate || !merchantRaw || originalAmount === undefined) {
    return undefined;
  }

  const settlementCurrency = inferSectionCurrency(sectionName);
  const direction: "debit" | "credit" =
    (settlementAmount ?? originalAmount) < 0 ? "credit" : "debit";

  return {
    transactionDate,
    description: merchantRaw,
    merchantRaw,
    category,
    originalAmount: Math.abs(originalAmount),
    originalCurrency: settlementCurrency,
    settlementAmount: settlementAmount !== undefined ? Math.abs(settlementAmount) : undefined,
    settlementCurrency,
    statementSection: sectionName,
    notes,
    direction,
  };
}

export function parseFibiBankWorkbook(workbook: WorkbookData): ParsedBankStatement {
  const sheet = workbook.sheets[0];
  const headerRowIndex = findFirstRowIndex(sheet.rows, (row) => row[0] === HEADER_TITLE);

  if (headerRowIndex === -1) {
    throw new Error("Could not find the FIBI transaction header row");
  }

  const accountLabel = normalizeRow(sheet.rows[0])[0] || undefined;
  const transactions: NormalizedBankTransaction[] = [];
  let currentSectionName: string | undefined;

  for (let i = headerRowIndex + 1; i < sheet.rows.length; i += 1) {
    const row = sheet.rows[i];
    const normalized = normalizeRow(row);

    if (normalized[0] === HEADER_TITLE) {
      continue;
    }

    if (
      normalized[0] &&
      normalized[0].startsWith("עסקאות שחויבו ב") &&
      normalized.slice(1).every((cell) => cell === "")
    ) {
      currentSectionName = normalized[0];
      continue;
    }

    if (isEffectivelyEmptyRow(row)) {
      continue;
    }

    const parsed = parseTransactionRow(row, currentSectionName);
    if (parsed) {
      transactions.push(parsed);
    }
  }

  return {
    templateId: "fibi_credit_statement",
    accountLabel,
    statementLabel: normalizeRow(sheet.rows[2])[0] || undefined,
    transactions,
  };
}
