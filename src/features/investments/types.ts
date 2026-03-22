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
