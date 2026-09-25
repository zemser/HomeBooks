import { isEffectivelyEmptyRow } from "@/features/imports/utils";
import {
  BANK_BRANCH_PREFIX,
  BANK_EXPORT_DATE_PREFIX,
  BANK_SECURITIES_DETECT_HEADER,
  EXCELLENCE_ACCOUNT_PREFIX,
} from "@/features/investments/constants";
import {
  columnIndex,
  findPrefixedValue,
  findSnapshotDate,
  normalizedSheetRows,
  sheetWithHeader,
} from "@/features/investments/providers/metadata";
import { buildPreviewHolding } from "@/features/investments/providers/preview-holding";
import type { InvestmentPreviewParser, InvestmentPreviewResult } from "@/features/investments/types";
import { findMatchingHeaderRowIndex, parseInvestmentNumber, parseInvestmentTextCell } from "@/features/investments/utils";

function bankAccountLabel(rows: string[][]) {
  const branch = findPrefixedValue(rows, BANK_BRANCH_PREFIX);
  const account = findPrefixedValue(rows, EXCELLENCE_ACCOUNT_PREFIX);

  if (branch && account) {
    return `${branch}-${account}`;
  }

  return account ?? branch;
}

export const bankSecuritiesPreviewParser: InvestmentPreviewParser = {
  parse(workbook): InvestmentPreviewResult {
    const sheet = sheetWithHeader(workbook.sheets, BANK_SECURITIES_DETECT_HEADER);

    if (!sheet) {
      throw new Error("Could not find a bank securities holdings sheet in the workbook.");
    }

    const rows = normalizedSheetRows(sheet);
    const headerRowIndex = findMatchingHeaderRowIndex(sheet.rows, BANK_SECURITIES_DETECT_HEADER);

    if (headerRowIndex === -1) {
      throw new Error("Could not find the bank securities holdings header.");
    }

    const header = rows[headerRowIndex] ?? [];
    const columns = {
      assetName: columnIndex(header, "נייר"),
      securityId: columnIndex(header, "מספר נייר"),
      lastPrice: columnIndex(header, "שער אחרון"),
      quantity: columnIndex(header, "כמות"),
      marketValueIls: columnIndex(header, "שווי אחזקה בשח"),
      marketValueNative: columnIndex(header, "שווי אחזקה במטבע"),
      dailyChangePct: columnIndex(header, "שינוי יומי באחוז"),
      dailyChangeNative: columnIndex(header, "שינוי יומי בסכום"),
      costBasisPrice: columnIndex(header, "שער עלות מותאם"),
      gainLossPct: columnIndex(header, "שינוי משער עלות מותאם באחוז"),
      gainLossIls: columnIndex(header, "שינוי משער עלות מותאם בשח"),
      portfolioWeightPct: columnIndex(header, "אחוז מהתיק"),
    };
    const holdings = [];

    for (let rowIndex = headerRowIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
      const rawRow = sheet.rows[rowIndex];

      if (!rawRow || isEffectivelyEmptyRow(rawRow)) {
        continue;
      }

      const row = rows[rowIndex] ?? [];
      const assetName = parseInvestmentTextCell(row, columns.assetName);
      const securityId = parseInvestmentTextCell(row, columns.securityId);
      const marketValueIls = parseInvestmentNumber(row[columns.marketValueIls]);

      if (!assetName || !securityId || marketValueIls === null) {
        continue;
      }

      holdings.push(
        buildPreviewHolding({
          assetName,
          securityId,
          lastPrice: parseInvestmentNumber(row[columns.lastPrice]),
          quantity: parseInvestmentNumber(row[columns.quantity]),
          marketValueIls,
          marketValueNative: parseInvestmentNumber(row[columns.marketValueNative]),
          dailyChangePct: parseInvestmentNumber(row[columns.dailyChangePct]),
          dailyChangeNative: parseInvestmentNumber(row[columns.dailyChangeNative]),
          costBasisPrice: parseInvestmentNumber(row[columns.costBasisPrice]),
          gainLossPct: parseInvestmentNumber(row[columns.gainLossPct]),
          gainLossIls: parseInvestmentNumber(row[columns.gainLossIls]),
          portfolioWeightPct: parseInvestmentNumber(row[columns.portfolioWeightPct]),
        }),
      );
    }

    const { snapshotDate, snapshotTimestampText } = findSnapshotDate(rows, [
      BANK_EXPORT_DATE_PREFIX,
    ]);
    const warnings: string[] = [];

    if (holdings.length === 0) {
      warnings.push("No holdings were parsed from this workbook.");
    }

    return {
      provider: "bank-securities",
      accountLabel: bankAccountLabel(rows),
      snapshotDate,
      snapshotTimestampText,
      activityPeriodStart: null,
      activityPeriodEnd: null,
      holdings,
      activities: [],
      warnings,
    } satisfies InvestmentPreviewResult;
  },
};
