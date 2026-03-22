import type { WorkbookSheet } from "@/features/imports/types";
import { isEffectivelyEmptyRow, normalizeRow } from "@/features/imports/utils";
import {
  EXCELLENCE_ACCOUNT_PREFIX,
  EXCELLENCE_DATA_DATE_PREFIX,
  EXCELLENCE_FILE_DATE_PREFIX,
  EXCELLENCE_HOLDING_COLUMN,
  EXCELLENCE_HOLDINGS_HEADER,
} from "@/features/investments/constants";
import type {
  InvestmentPreviewHolding,
  InvestmentPreviewParser,
  InvestmentPreviewResult,
} from "@/features/investments/types";
import {
  extractTimestampText,
  findMatchingHeaderRowIndex,
  normalizeMetadataValue,
  parseInvestmentNumber,
  parseInvestmentTextCell,
  parseSlashDateToIso,
} from "@/features/investments/utils";

function isLikelySnapshotDateTime(value: string) {
  return /^\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?$/.test(value.trim());
}

function parseHoldingRow(row: string[]): InvestmentPreviewHolding | null {
  const assetName = parseInvestmentTextCell(row, EXCELLENCE_HOLDING_COLUMN.assetName);

  if (!assetName) {
    return null;
  }

  return {
    assetName,
    securityId: parseInvestmentTextCell(row, EXCELLENCE_HOLDING_COLUMN.securityId),
    lastPrice: parseInvestmentNumber(row[EXCELLENCE_HOLDING_COLUMN.lastPrice]),
    quantity: parseInvestmentNumber(row[EXCELLENCE_HOLDING_COLUMN.quantity]),
    marketValueIls: parseInvestmentNumber(row[EXCELLENCE_HOLDING_COLUMN.marketValueIls]),
    marketValueNative: parseInvestmentNumber(row[EXCELLENCE_HOLDING_COLUMN.marketValueNative]),
    dailyChangePct: parseInvestmentNumber(row[EXCELLENCE_HOLDING_COLUMN.dailyChangePct]),
    dailyChangeNative: parseInvestmentNumber(row[EXCELLENCE_HOLDING_COLUMN.dailyChangeNative]),
    costBasisPrice: parseInvestmentNumber(row[EXCELLENCE_HOLDING_COLUMN.costBasisPrice]),
    gainLossPct: parseInvestmentNumber(row[EXCELLENCE_HOLDING_COLUMN.gainLossPct]),
    gainLossNative: parseInvestmentNumber(row[EXCELLENCE_HOLDING_COLUMN.gainLossNative]),
    gainLossIls: parseInvestmentNumber(row[EXCELLENCE_HOLDING_COLUMN.gainLossIls]),
    portfolioWeightPct: parseInvestmentNumber(row[EXCELLENCE_HOLDING_COLUMN.portfolioWeightPct]),
    loanedQuantity: parseInvestmentNumber(row[EXCELLENCE_HOLDING_COLUMN.loanedQuantity]),
    aiRecommendation: parseInvestmentTextCell(row, EXCELLENCE_HOLDING_COLUMN.aiRecommendation),
    aiScore: parseInvestmentTextCell(row, EXCELLENCE_HOLDING_COLUMN.aiScore),
    personalNote: parseInvestmentTextCell(row, EXCELLENCE_HOLDING_COLUMN.personalNote),
  };
}

function extractAccountLabel(rows: string[][]) {
  for (const row of rows) {
    const label = normalizeMetadataValue(row[0] ?? "", EXCELLENCE_ACCOUNT_PREFIX);

    if (label) {
      return label;
    }
  }

  return null;
}

function extractSnapshotMetadata(rows: string[][]): {
  snapshotDate: string | null;
  snapshotTimestampText: string | null;
} {
  let snapshotDate: string | null = null;
  let snapshotTimestampText: string | null = null;

  for (const row of rows) {
    const firstCell = row[0] ?? "";
    const dataDateValue = normalizeMetadataValue(firstCell, EXCELLENCE_DATA_DATE_PREFIX);

    if (dataDateValue) {
      snapshotDate = parseSlashDateToIso(dataDateValue) ?? snapshotDate;
      snapshotTimestampText = dataDateValue;
      break;
    }
  }

  if (!snapshotDate) {
    for (const row of rows) {
      const firstCell = row[0] ?? "";
      const fileDateValue = normalizeMetadataValue(firstCell, EXCELLENCE_FILE_DATE_PREFIX);

      if (fileDateValue) {
        snapshotDate = parseSlashDateToIso(fileDateValue) ?? snapshotDate;
        snapshotTimestampText = extractTimestampText(firstCell);
        break;
      }
    }
  }

  if (!snapshotDate || !snapshotTimestampText) {
    for (const row of rows) {
      const firstCell = (row[0] ?? "").trim();

      if (!isLikelySnapshotDateTime(firstCell)) {
        continue;
      }

      snapshotDate = snapshotDate ?? parseSlashDateToIso(firstCell);
      snapshotTimestampText = snapshotTimestampText ?? firstCell;
      break;
    }
  }

  return {
    snapshotDate,
    snapshotTimestampText,
  };
}

function selectHoldingsSheet(sheets: WorkbookSheet[]) {
  const matchingSheet = sheets.find(
    (sheet) => findMatchingHeaderRowIndex(sheet.rows, EXCELLENCE_HOLDINGS_HEADER) !== -1,
  );

  if (!matchingSheet) {
    throw new Error("Could not find an Excellence holdings sheet in the workbook.");
  }

  return matchingSheet;
}

function parseHoldings(sheet: WorkbookSheet) {
  const headerRowIndex = findMatchingHeaderRowIndex(sheet.rows, EXCELLENCE_HOLDINGS_HEADER);

  if (headerRowIndex === -1) {
    throw new Error("Could not find the Excellence holdings header row.");
  }

  const holdings: InvestmentPreviewHolding[] = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
    const rawRow = sheet.rows[rowIndex];

    if (isEffectivelyEmptyRow(rawRow)) {
      continue;
    }

    const normalizedRow = normalizeRow(rawRow);

    if (normalizedRow[0] === EXCELLENCE_HOLDINGS_HEADER[0]) {
      continue;
    }

    const holding = parseHoldingRow(normalizedRow);

    if (holding) {
      holdings.push(holding);
    }
  }

  return {
    headerRowIndex,
    holdings,
  };
}

export const excellenceInvestmentPreviewParser: InvestmentPreviewParser = {
  parse(workbook): InvestmentPreviewResult {
    const sheet = selectHoldingsSheet(workbook.sheets);
    const normalizedRows = sheet.rows.map((row) => normalizeRow(row));
    const { holdings } = parseHoldings(sheet);
    const { snapshotDate, snapshotTimestampText } = extractSnapshotMetadata(normalizedRows);

    return {
      provider: "excellence",
      accountLabel: extractAccountLabel(normalizedRows),
      snapshotDate,
      snapshotTimestampText,
      holdings,
      activities: [],
      warnings: [
        "Current Excellence samples appear to be holdings snapshots only, so activity rows are not available in this preview yet.",
      ],
    };
  },
};
