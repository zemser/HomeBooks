import type { InvestmentPreviewHolding } from "@/features/investments/types";

export function buildPreviewHolding(
  input: Partial<InvestmentPreviewHolding> & Pick<InvestmentPreviewHolding, "assetName">,
): InvestmentPreviewHolding {
  return {
    assetName: input.assetName,
    securityId: input.securityId ?? null,
    lastPrice: input.lastPrice ?? null,
    quantity: input.quantity ?? null,
    marketValueIls: input.marketValueIls ?? null,
    marketValueNative: input.marketValueNative ?? null,
    dailyChangePct: input.dailyChangePct ?? null,
    dailyChangeNative: input.dailyChangeNative ?? null,
    costBasisPrice: input.costBasisPrice ?? null,
    gainLossPct: input.gainLossPct ?? null,
    gainLossNative: input.gainLossNative ?? null,
    gainLossIls: input.gainLossIls ?? null,
    portfolioWeightPct: input.portfolioWeightPct ?? null,
    loanedQuantity: input.loanedQuantity ?? null,
    aiRecommendation: input.aiRecommendation ?? null,
    aiScore: input.aiScore ?? null,
    personalNote: input.personalNote ?? null,
  };
}

export function withAccountPortfolioWeights(holdings: InvestmentPreviewHolding[]) {
  const total = holdings.reduce((sum, holding) => sum + (holding.marketValueIls ?? 0), 0);

  return holdings.map((holding) => {
    if (holding.portfolioWeightPct !== null || holding.marketValueIls === null || total <= 0) {
      return holding;
    }

    return {
      ...holding,
      portfolioWeightPct: (holding.marketValueIls / total) * 100,
    };
  });
}
