import type { WorkbookData } from "@/features/imports/types";

export type InvestmentProviderId = "excellence";
export type InvestmentActivityType =
  | "buy"
  | "sell"
  | "dividend"
  | "fee"
  | "cash_in"
  | "cash_out";

export type DetectedInvestmentTemplate =
  | {
      id: InvestmentProviderId;
      confidence: number;
      reason: string;
    }
  | {
      id: "unknown";
      confidence: number;
      reason: string;
    };

export type InvestmentPreviewHolding = {
  assetName: string;
  securityId: string | null;
  lastPrice: number | null;
  quantity: number | null;
  marketValueIls: number | null;
  marketValueNative: number | null;
  dailyChangePct: number | null;
  dailyChangeNative: number | null;
  costBasisPrice: number | null;
  gainLossPct: number | null;
  gainLossNative: number | null;
  gainLossIls: number | null;
  portfolioWeightPct: number | null;
  loanedQuantity: number | null;
  aiRecommendation: string | null;
  aiScore: string | null;
  personalNote: string | null;
};

export type InvestmentPreviewActivity = {
  activityDate: string | null;
  assetName: string;
  assetSymbol: string | null;
  activityType: InvestmentActivityType;
  activityTypeLabel: string;
  providerActionLabel: string;
  quantity: number | null;
  unitPrice: number | null;
  totalAmount: number | null;
  currency: string | null;
  normalizedAmount: number | null;
  notes: string | null;
};

export type InvestmentPreviewResult = {
  provider: InvestmentProviderId;
  accountLabel: string | null;
  snapshotDate: string | null;
  snapshotTimestampText: string | null;
  activityPeriodStart: string | null;
  activityPeriodEnd: string | null;
  holdings: InvestmentPreviewHolding[];
  activities: InvestmentPreviewActivity[];
  warnings: string[];
};

export type InvestmentPreviewParser = {
  parse: (workbook: WorkbookData) => InvestmentPreviewResult;
};

export type InvestmentImportSummary = {
  id: string;
  originalFilename: string;
  importStatus: string;
  createdAt: string;
  completedAt: string | null;
  sourceName: string | null;
  holdingCount: number;
  activityCount: number;
  snapshotDate: string | null;
  activityPeriodStart: string | null;
  activityPeriodEnd: string | null;
};

export type InvestmentAssetType =
  | "cash"
  | "index"
  | "stock"
  | "fund"
  | "bond"
  | "other";

export type InvestmentAssetTypeSource = "saved" | "estimated";

export type PersistedInvestmentHolding = {
  assetName: string;
  assetSymbol: string | null;
  assetType: InvestmentAssetType;
  assetTypeSource: InvestmentAssetTypeSource;
  quantity: number | null;
  marketValue: number;
  marketValueCurrency: string;
  normalizedMarketValue: number;
  costBasis: number | null;
  gainLoss: number | null;
};

export type InvestmentAccountHoldingsSnapshot = {
  accountId: string;
  accountDisplayName: string;
  ownerMemberId: string | null;
  ownerDisplayName: string | null;
  sourceName: string | null;
  snapshotDate: string;
  importId: string;
  importCreatedAt: string;
  importOriginalFilename: string;
  holdingCount: number;
  totalMarketValue: number;
  totalCostBasis: number | null;
  totalGainLoss: number | null;
  holdings: PersistedInvestmentHolding[];
};

export type PersistedInvestmentActivity = {
  id: string;
  investmentAccountId: string;
  accountDisplayName: string;
  ownerDisplayName: string | null;
  activityDate: string;
  assetName: string;
  assetSymbol: string | null;
  activityType: InvestmentActivityType;
  activityTypeLabel: string;
  quantity: number | null;
  unitPrice: number | null;
  totalAmount: number | null;
  currency: string | null;
  normalizedAmount: number | null;
  importId: string;
  importOriginalFilename: string;
  importCreatedAt: string;
};

export type InvestmentPortfolioAccountLeader = {
  accountId: string;
  accountDisplayName: string;
  totalMarketValue: number;
  portfolioSharePct: number | null;
};

export type InvestmentPortfolioHoldingLeader = {
  accountId: string;
  accountDisplayName: string;
  assetName: string;
  assetSymbol: string | null;
  marketValue: number;
  portfolioWeightPct: number | null;
};

export type InvestmentAssetMixItem = {
  assetType: InvestmentAssetType;
  assetTypeLabel: string;
  totalMarketValue: number;
  portfolioSharePct: number | null;
  holdingCount: number;
  accountCount: number;
  estimatedHoldingCount: number;
};

export type InvestmentOwnerOverview = {
  ownerKey: string;
  ownerMemberId: string | null;
  ownerDisplayName: string;
  accountCount: number;
  holdingCount: number;
  totalMarketValue: number;
  portfolioSharePct: number | null;
  latestSnapshotDate: string | null;
  dominantAssetType: InvestmentAssetType | null;
  dominantAssetTypeLabel: string | null;
  dominantAssetTypeSharePct: number | null;
};

export type InvestmentTopPosition = {
  positionKey: string;
  assetName: string;
  assetSymbol: string | null;
  assetType: InvestmentAssetType;
  assetTypeLabel: string;
  totalMarketValue: number;
  portfolioSharePct: number | null;
  accountCount: number;
};

export type InvestmentAccountOverview = {
  accountId: string;
  accountDisplayName: string;
  ownerDisplayName: string | null;
  sourceName: string | null;
  snapshotDate: string;
  importCreatedAt: string;
  holdingCount: number;
  holdingsWithCostBasisCount: number;
  totalMarketValue: number;
  totalCostBasis: number | null;
  totalGainLoss: number | null;
  totalGainLossPct: number | null;
  portfolioSharePct: number | null;
  topHoldingName: string | null;
  topHoldingSymbol: string | null;
  topHoldingMarketValue: number | null;
  topHoldingWeightPct: number | null;
  topThreeHoldingsWeightPct: number | null;
  concentrationHint: string;
  concentrationLevel: "balanced" | "watch";
};

export type InvestmentPortfolioSummary = {
  accountCount: number;
  holdingCount: number;
  holdingsWithCostBasisCount: number;
  totalMarketValue: number;
  totalCostBasis: number | null;
  totalGainLoss: number | null;
  totalGainLossPct: number | null;
  oldestSnapshotDate: string | null;
  latestSnapshotDate: string | null;
  estimatedAssetTypeCount: number;
  largestAccount: InvestmentPortfolioAccountLeader | null;
  topHolding: InvestmentPortfolioHoldingLeader | null;
};

export type InvestmentPortfolioReport = {
  summary: InvestmentPortfolioSummary;
  assetMix: InvestmentAssetMixItem[];
  ownerOverviews: InvestmentOwnerOverview[];
  topPositions: InvestmentTopPosition[];
  accountOverviews: InvestmentAccountOverview[];
};

export type SaveInvestmentImportResult =
  | {
      status: "saved";
      importId: string;
      importStatus: string;
      holdingCount: number;
      activityCount: number;
      duplicateOfImportId?: undefined;
    }
  | {
      status: "duplicate";
      importId: string;
      importStatus: string;
      holdingCount: number;
      activityCount: number;
      duplicateOfImportId: string;
    };
