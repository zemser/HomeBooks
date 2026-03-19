import type { DetectedTemplate, WorkbookData } from "@/features/imports/types";
import { normalizeRow } from "@/features/imports/utils";

const FIBI_HEADER = [
  "תאריך\nעסקה",
  "שם בית עסק",
  "סכום\nעסקה",
  "סכום\nחיוב",
  "סוג\nעסקה",
];

const DISCOUNT_HEADER = [
  "תאריך עסקה",
  "שם בית העסק",
  "קטגוריה",
  "4 ספרות אחרונות של כרטיס האשראי",
  "סוג עסקה",
  "סכום חיוב",
];

function headerIncludes(row: string[], expected: string[]): boolean {
  return expected.every((cell) => row.includes(cell));
}

export function detectBankTemplate(workbook: WorkbookData): DetectedTemplate {
  for (const sheet of workbook.sheets) {
    for (const rawRow of sheet.rows.slice(0, 20)) {
      const row = normalizeRow(rawRow);

      if (headerIncludes(row, FIBI_HEADER)) {
        return {
          id: "fibi_credit_statement",
          confidence: 0.96,
          reason: `Matched FIBI-style statement header in sheet "${sheet.name}"`,
        };
      }

      if (headerIncludes(row, DISCOUNT_HEADER)) {
        return {
          id: "discount_card_export",
          confidence: 0.96,
          reason: `Matched Discount card export header in sheet "${sheet.name}"`,
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

