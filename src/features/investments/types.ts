import type { WorkbookData } from "@/features/imports/types";

export type InvestmentProviderId = "excellence";

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
  activityType: string;
  quantity: number | null;
  unitPrice: number | null;
  totalAmount: number | null;
  currency: string | null;
};

export type InvestmentPreviewResult = {
  provider: InvestmentProviderId;
  accountLabel: string | null;
  snapshotDate: string | null;
  snapshotTimestampText: string | null;
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
  snapshotDate: string | null;
};

export type PersistedInvestmentHolding = {
  assetName: string;
  assetSymbol: string | null;
  assetType: string;
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
  largestAccount: InvestmentPortfolioAccountLeader | null;
  topHolding: InvestmentPortfolioHoldingLeader | null;
};

export type InvestmentPortfolioReport = {
  summary: InvestmentPortfolioSummary;
  accountOverviews: InvestmentAccountOverview[];
};

export type SaveInvestmentImportResult =
  | {
      status: "saved";
      importId: string;
      importStatus: string;
      holdingCount: number;
      duplicateOfImportId?: undefined;
    }
  | {
      status: "duplicate";
      importId: string;
      importStatus: string;
      holdingCount: number;
      duplicateOfImportId: string;
    };
