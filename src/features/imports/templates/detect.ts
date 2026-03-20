import type { DetectedTemplate, WorkbookData } from "@/features/imports/types";
import { normalizeRow } from "@/features/imports/utils";

const MAX_HEADER = [
  "תאריך\nעסקה",
  "שם בית עסק",
  "סכום\nעסקה",
  "סכום\nחיוב",
  "סוג\nעסקה",
];

const CAL_CARD_EXPORT_HEADER = [
  "תאריך עסקה",
  "שם בית העסק",
  "קטגוריה",
  "4 ספרות אחרונות של כרטיס האשראי",
  "סוג עסקה",
  "סכום חיוב",
];

const CAL_RECENT_TRANSACTIONS_HEADER = [
  "תאריך\nעסקה",
  "שם בית עסק",
  "סכום\nבש\"ח",
  "מועד\nחיוב",
];

function headerIncludes(row: string[], expected: string[]): boolean {
  return expected.every((cell) => row.includes(cell));
}

export function detectBankTemplate(workbook: WorkbookData): DetectedTemplate {
  for (const sheet of workbook.sheets) {
    for (const rawRow of sheet.rows.slice(0, 20)) {
      const row = normalizeRow(rawRow);

      if (headerIncludes(row, MAX_HEADER)) {
        return {
          id: "max_credit_statement",
          confidence: 0.96,
          reason: `Matched Max statement header in sheet "${sheet.name}"`,
        };
      }

      if (headerIncludes(row, CAL_CARD_EXPORT_HEADER)) {
        return {
          id: "cal_card_export",
          confidence: 0.96,
          reason: `Matched Cal card export header in sheet "${sheet.name}"`,
        };
      }

      if (headerIncludes(row, CAL_RECENT_TRANSACTIONS_HEADER)) {
        return {
          id: "cal_recent_transactions_report",
          confidence: 0.96,
          reason: `Matched Cal recent-transactions header in sheet "${sheet.name}"`,
        };
      }
    }
  }

  return {
    id: "unknown",
    confidence: 0,
    reason: "No supported bank statement header matched the workbook",
  };
}
