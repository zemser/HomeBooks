import type { WorkbookSheet } from "@/features/imports/types";
import { isEffectivelyEmptyRow, normalizeRow } from "@/features/imports/utils";
import {
  EXCELLENCE_ACCOUNT_PREFIX,
  EXCELLENCE_ACTIVITY_COLUMN,
  EXCELLENCE_ACTIVITY_HEADER,
  EXCELLENCE_DATA_DATE_PREFIX,
  EXCELLENCE_FILE_DATE_PREFIX,
  EXCELLENCE_HOLDING_COLUMN,
  EXCELLENCE_HOLDINGS_HEADER,
  EXCELLENCE_PERIOD_PREFIX,
} from "@/features/investments/constants";
import type {
  InvestmentActivityType,
  InvestmentPreviewActivity,
  InvestmentPreviewHolding,
  InvestmentPreviewParser,
  InvestmentPreviewResult,
} from "@/features/investments/types";
import {
  extractTimestampText,
  findMatchingHeaderRowIndex,
  getInvestmentActivityTypeLabel,
  normalizeMetadataValue,
  parseInvestmentNumber,
  parseInvestmentTextCell,
  parseSlashDateRangeToIso,
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

function extractActivityPeriod(rows: string[][]) {
  for (const row of rows) {
    const periodValue = normalizeMetadataValue(row[0] ?? "", EXCELLENCE_PERIOD_PREFIX);

    if (!periodValue) {
      continue;
    }

    return parseSlashDateRangeToIso(periodValue);
  }

  return {
    startDate: null,
    endDate: null,
  };
}

function selectSheetByHeader(
  sheets: WorkbookSheet[],
  expectedHeader: readonly string[],
) {
  return (
    sheets.find(
      (sheet) => findMatchingHeaderRowIndex(sheet.rows, expectedHeader) !== -1,
    ) ?? null
  );
}

function parseHoldings(sheet: WorkbookSheet | null) {
  if (!sheet) {
    return [];
  }

  const headerRowIndex = findMatchingHeaderRowIndex(sheet.rows, EXCELLENCE_HOLDINGS_HEADER);

  if (headerRowIndex === -1) {
    return [];
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

  return holdings;
}

function cleanActivityAssetName(rawAssetName: string) {
  const trimmed = rawAssetName.trim();
  const slashIndex = trimmed.indexOf("/");

  if (slashIndex === -1) {
    return trimmed;
  }

  const suffix = trimmed.slice(slashIndex + 1).trim();
  return suffix || trimmed;
}

function resolveActivityAssetSymbol(input: {
  rawAssetName: string;
  securityId: string | null;
}) {
  const cleanedAssetName = cleanActivityAssetName(input.rawAssetName);
  const trailingTickerMatch = cleanedAssetName.match(/([A-Z][A-Z0-9.\-]*\s+[A-Z]{2})$/);

  if (trailingTickerMatch) {
    return trailingTickerMatch[1];
  }

  if (
    input.securityId
    && input.securityId !== "-"
    && !input.securityId.startsWith("999")
    && input.securityId !== "99028"
  ) {
    return input.securityId;
  }

  return null;
}

function getSignedAmount(
  value: number | null,
  activityType: InvestmentActivityType,
) {
  if (value === null) {
    return null;
  }

  const absoluteValue = Math.abs(value);

  if (activityType === "buy" || activityType === "fee" || activityType === "cash_out") {
    return -absoluteValue;
  }

  return absoluteValue;
}

function resolveActivityCurrency(input: {
  rawAssetName: string;
  totalAmount: number | null;
  normalizedAmount: number | null;
  conversionRate: number | null;
}) {
  if (input.totalAmount === null) {
    return null;
  }

  if (
    input.conversionRate === null
    || input.conversionRate === 1
    || input.normalizedAmount === null
    || Math.abs(input.totalAmount - input.normalizedAmount) < 0.000001
  ) {
    return "ILS";
  }

  if (/\bUS\b/.test(input.rawAssetName)) {
    return "USD";
  }

  return null;
}

function resolveActivityType(input: {
  actionLabel: string;
  rawAssetName: string;
  normalizedAmount: number | null;
}) {
  const action = input.actionLabel.trim();
  const isPositive = (input.normalizedAmount ?? 0) >= 0;
  const taxLikeAsset = input.rawAssetName.includes("מס");

  if (action === "ק/רצף") {
    return {
      activityType: "buy" as const,
      usedHeuristic: false,
    };
  }

  if (action === "קניה") {
    return {
      activityType: taxLikeAsset ? "fee" as const : "buy" as const,
      usedHeuristic: taxLikeAsset,
    };
  }

  if (action === "מכירה") {
    return {
      activityType: taxLikeAsset ? "fee" as const : "sell" as const,
      usedHeuristic: taxLikeAsset,
    };
  }

  if (action === "הפ/דיב") {
    return {
      activityType: "dividend" as const,
      usedHeuristic: false,
    };
  }

  if (action === "מש/מסח" || action === "מש/מס") {
    return {
      activityType: "fee" as const,
      usedHeuristic: false,
    };
  }

  if (action === "הפ/מסח") {
    return {
      activityType: "cash_in" as const,
      usedHeuristic: false,
    };
  }

  if (action === "העברה" || action === "ריבית") {
    return {
      activityType: isPositive ? "cash_in" as const : "cash_out" as const,
      usedHeuristic: false,
    };
  }

  return {
    activityType: isPositive ? "cash_in" as const : "cash_out" as const,
    usedHeuristic: true,
  };
}

function buildActivityNotes(input: {
  commission: number | null;
  usedHeuristic: boolean;
  rawAssetName: string;
}) {
  const notes: string[] = [];

  if (input.commission !== null && Math.abs(input.commission) > 0.000001) {
    notes.push(`Commission: ${input.commission.toFixed(2)} ILS`);
  }

  if (input.usedHeuristic && input.rawAssetName !== cleanActivityAssetName(input.rawAssetName)) {
    notes.push("Action type was inferred from the provider row label.");
  } else if (input.usedHeuristic) {
    notes.push("Action type was inferred from the provider action code.");
  }

  return notes.length > 0 ? notes.join(" · ") : null;
}

function parseActivityRow(row: string[]): {
  activity: InvestmentPreviewActivity | null;
  usedHeuristic: boolean;
} {
  const rawAssetName = parseInvestmentTextCell(row, EXCELLENCE_ACTIVITY_COLUMN.assetName);

  if (!rawAssetName) {
    return {
      activity: null,
      usedHeuristic: false,
    };
  }

  const providerActionLabel =
    parseInvestmentTextCell(row, EXCELLENCE_ACTIVITY_COLUMN.action) ?? "Activity";
  const totalAmount = parseInvestmentNumber(row[EXCELLENCE_ACTIVITY_COLUMN.totalAmount]);
  const normalizedAmount = parseInvestmentNumber(
    row[EXCELLENCE_ACTIVITY_COLUMN.totalAmountIls],
  );
  const conversionRate = parseInvestmentNumber(
    row[EXCELLENCE_ACTIVITY_COLUMN.conversionRate],
  );
  const commission = parseInvestmentNumber(row[EXCELLENCE_ACTIVITY_COLUMN.commission]);
  const { activityType, usedHeuristic } = resolveActivityType({
    actionLabel: providerActionLabel,
    rawAssetName,
    normalizedAmount,
  });
  const assetName = cleanActivityAssetName(rawAssetName);

  return {
    usedHeuristic,
    activity: {
      activityDate: parseSlashDateToIso(
        row[EXCELLENCE_ACTIVITY_COLUMN.effectiveDate]
          || row[EXCELLENCE_ACTIVITY_COLUMN.entryDate]
          || "",
      ),
      assetName,
      assetSymbol: resolveActivityAssetSymbol({
        rawAssetName,
        securityId: parseInvestmentTextCell(row, EXCELLENCE_ACTIVITY_COLUMN.securityId),
      }),
      activityType,
      activityTypeLabel: getInvestmentActivityTypeLabel(activityType),
      providerActionLabel,
      quantity:
        activityType === "buy" || activityType === "sell"
          ? parseInvestmentNumber(row[EXCELLENCE_ACTIVITY_COLUMN.quantity])
          : null,
      unitPrice:
        activityType === "buy" || activityType === "sell"
          ? parseInvestmentNumber(row[EXCELLENCE_ACTIVITY_COLUMN.unitPrice])
          : null,
      totalAmount: getSignedAmount(totalAmount, activityType),
      currency: resolveActivityCurrency({
        rawAssetName,
        totalAmount,
        normalizedAmount,
        conversionRate,
      }),
      normalizedAmount: getSignedAmount(normalizedAmount, activityType),
      notes: buildActivityNotes({
        commission,
        usedHeuristic,
        rawAssetName,
      }),
    },
  };
}

function parseActivities(sheet: WorkbookSheet | null) {
  if (!sheet) {
    return {
      activities: [] as InvestmentPreviewActivity[],
      heuristicActionLabels: [] as string[],
    };
  }

  const headerRowIndex = findMatchingHeaderRowIndex(sheet.rows, EXCELLENCE_ACTIVITY_HEADER);

  if (headerRowIndex === -1) {
    return {
      activities: [] as InvestmentPreviewActivity[],
      heuristicActionLabels: [] as string[],
    };
  }

  const activities: InvestmentPreviewActivity[] = [];
  const heuristicActionLabels = new Set<string>();

  for (let rowIndex = headerRowIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
    const rawRow = sheet.rows[rowIndex];

    if (isEffectivelyEmptyRow(rawRow)) {
      continue;
    }

    const normalizedRow = normalizeRow(rawRow);

    if (normalizedRow[0] === EXCELLENCE_ACTIVITY_HEADER[0]) {
      continue;
    }

    const { activity, usedHeuristic } = parseActivityRow(normalizedRow);

    if (!activity) {
      continue;
    }

    if (usedHeuristic) {
      heuristicActionLabels.add(activity.providerActionLabel);
    }

    activities.push(activity);
  }

  return {
    activities,
    heuristicActionLabels: [...heuristicActionLabels],
  };
}

export const excellenceInvestmentPreviewParser: InvestmentPreviewParser = {
  parse(workbook): InvestmentPreviewResult {
    const holdingsSheet = selectSheetByHeader(workbook.sheets, EXCELLENCE_HOLDINGS_HEADER);
    const activitySheet = selectSheetByHeader(workbook.sheets, EXCELLENCE_ACTIVITY_HEADER);
    const metadataSheet = holdingsSheet ?? activitySheet;

    if (!metadataSheet) {
      throw new Error("Could not find a supported Excellence sheet in the workbook.");
    }

    const normalizedRows = metadataSheet.rows.map((row) => normalizeRow(row));
    const holdings = parseHoldings(holdingsSheet);
    const { activities, heuristicActionLabels } = parseActivities(activitySheet);
    const { snapshotDate, snapshotTimestampText } = extractSnapshotMetadata(normalizedRows);
    const { startDate, endDate } = extractActivityPeriod(normalizedRows);
    const warnings: string[] = [];

    if (holdings.length === 0 && activities.length > 0) {
      warnings.push(
        "This workbook contains activity rows only, so saving it will not change the saved holdings composition view.",
      );
    }

    if (activities.length > 0) {
      warnings.push(
        "Investment activity rows are mapped from provider-specific action codes in this first pass, so tax-like rows may still need follow-up polish.",
      );
    }

    if (heuristicActionLabels.length > 0) {
      warnings.push(
        `Mapped these provider action labels heuristically: ${heuristicActionLabels.join(", ")}.`,
      );
    }

    if (holdings.length === 0 && activities.length === 0) {
      warnings.push("No holdings or activity rows were parsed from this workbook.");
    }

    return {
      provider: "excellence",
      accountLabel: extractAccountLabel(normalizedRows),
      snapshotDate,
      snapshotTimestampText,
      activityPeriodStart: startDate,
      activityPeriodEnd: endDate,
      holdings,
      activities,
      warnings,
    };
  },
};
