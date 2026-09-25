import { isEffectivelyEmptyRow } from "@/features/imports/utils";
import {
  CURRENT_PORTFOLIO_DETECT_HEADER,
  EXCELLENCE_ACCOUNT_PREFIX,
  EXCELLENCE_DATA_DATE_PREFIX,
  EXCELLENCE_FILE_DATE_PREFIX,
} from "@/features/investments/constants";
import {
  columnIndex,
  columnIndexByPrefix,
  findPrefixedValue,
  findSnapshotDate,
  normalizedSheetRows,
  sheetWithHeader,
} from "@/features/investments/providers/metadata";
import {
  buildPreviewHolding,
  withAccountPortfolioWeights,
} from "@/features/investments/providers/preview-holding";
import type { InvestmentPreviewParser, InvestmentPreviewResult } from "@/features/investments/types";
import { findMatchingHeaderRowIndex, parseInvestmentNumber, parseInvestmentTextCell } from "@/features/investments/utils";

export const currentPortfolioPreviewParser: InvestmentPreviewParser = {
  parse(workbook): InvestmentPreviewResult {
    const sheet = sheetWithHeader(workbook.sheets, CURRENT_PORTFOLIO_DETECT_HEADER);

    if (!sheet) {
      throw new Error("Could not find a current-portfolio holdings sheet in the workbook.");
    }

    const rows = normalizedSheetRows(sheet);
    const headerRowIndex = findMatchingHeaderRowIndex(sheet.rows, CURRENT_PORTFOLIO_DETECT_HEADER);

    if (headerRowIndex === -1) {
      throw new Error("Could not find the current-portfolio holdings header.");
    }

    const header = rows[headerRowIndex] ?? [];
    const columns = {
      assetName: columnIndex(header, "שם נייר"),
      securityId: columnIndex(header, "מספר נייר"),
      lastPrice: columnIndex(header, "שער אחרון"),
      dailyChangePct: columnIndex(header, "שינוי יומי %"),
      dailyChangeNative: columnIndex(header, "שינוי יומי במטבע הנייר"),
      quantity: columnIndex(header, "כמות בתיק"),
      marketValueNative: columnIndex(header, "שווי אחזקה במטבע הנייר"),
      marketValueIls: columnIndex(header, "שווי אחזקה (₪)"),
      costBasisPrice: columnIndex(header, "שער עלות"),
      gainLossNative: columnIndex(header, "שינוי מעלות במטבע הנייר"),
      gainLossPct: columnIndex(header, "שינוי מעלות %"),
      gainLossIls: columnIndexByPrefix(header, "שינוי מעלות בש"),
      personalNote: columnIndex(header, "הערה אישית"),
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
          gainLossNative: parseInvestmentNumber(row[columns.gainLossNative]),
          gainLossIls: parseInvestmentNumber(row[columns.gainLossIls]),
          personalNote: parseInvestmentTextCell(row, columns.personalNote),
        }),
      );
    }

    const { snapshotDate, snapshotTimestampText } = findSnapshotDate(rows, [
      EXCELLENCE_DATA_DATE_PREFIX,
      EXCELLENCE_FILE_DATE_PREFIX,
    ]);
    const warnings: string[] = [];

    if (holdings.length === 0) {
      warnings.push("No holdings were parsed from this workbook.");
    }

    return {
      provider: "current-portfolio",
      accountLabel: findPrefixedValue(rows, EXCELLENCE_ACCOUNT_PREFIX),
      snapshotDate,
      snapshotTimestampText,
      activityPeriodStart: null,
      activityPeriodEnd: null,
      holdings: withAccountPortfolioWeights(holdings),
      activities: [],
      warnings,
    } satisfies InvestmentPreviewResult;
  },
};
