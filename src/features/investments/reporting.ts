import type {
  InvestmentAccountHoldingsSnapshot,
  InvestmentAccountOverview,
  InvestmentPortfolioHoldingLeader,
  InvestmentPortfolioReport,
  InvestmentPortfolioSummary,
} from "@/features/investments/types";

function addNullableNumber(current: number | null, next: number | null) {
  if (next === null) {
    return current;
  }

  return (current ?? 0) + next;
}

function toPercentage(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return null;
  }

  return (value / total) * 100;
}

function getConcentrationSummary(input: {
  holdingCount: number;
  topHoldingWeightPct: number | null;
  topThreeHoldingsWeightPct: number | null;
}) {
  if (input.holdingCount <= 1) {
    return {
      concentrationHint: "Single-position account",
      concentrationLevel: "watch" as const,
    };
  }

  if (input.topHoldingWeightPct === null) {
    return {
      concentrationHint: "No concentration signal yet",
      concentrationLevel: "balanced" as const,
    };
  }

  if (input.topHoldingWeightPct >= 60) {
    return {
      concentrationHint: "Very concentrated in one holding",
      concentrationLevel: "watch" as const,
    };
  }

  if (input.topHoldingWeightPct >= 40) {
    return {
      concentrationHint: "Top holding dominates",
      concentrationLevel: "watch" as const,
    };
  }

  if ((input.topThreeHoldingsWeightPct ?? 0) >= 80) {
    return {
      concentrationHint: "Most value sits in three holdings",
      concentrationLevel: "watch" as const,
    };
  }

  if (input.holdingCount >= 8 && input.topHoldingWeightPct < 25) {
    return {
      concentrationHint: "Relatively diversified mix",
      concentrationLevel: "balanced" as const,
    };
  }

  return {
    concentrationHint: "Moderate concentration",
    concentrationLevel: "balanced" as const,
  };
}

function buildAccountOverview(
  account: InvestmentAccountHoldingsSnapshot,
  portfolioMarketValue: number,
): InvestmentAccountOverview {
  const holdingsSortedByValue = [...account.holdings].sort((left, right) => {
    if (right.marketValue !== left.marketValue) {
      return right.marketValue - left.marketValue;
    }

    return left.assetName.localeCompare(right.assetName);
  });
  const topHolding = holdingsSortedByValue[0] ?? null;
  const topThreeMarketValue = holdingsSortedByValue
    .slice(0, 3)
    .reduce((sum, holding) => sum + holding.marketValue, 0);
  const holdingsWithCostBasisCount = account.holdings.filter(
    (holding) => holding.costBasis !== null,
  ).length;
  const portfolioSharePct = toPercentage(
    account.totalMarketValue,
    portfolioMarketValue,
  );
  const topHoldingWeightPct = topHolding
    ? toPercentage(topHolding.marketValue, account.totalMarketValue)
    : null;
  const topThreeHoldingsWeightPct = toPercentage(
    topThreeMarketValue,
    account.totalMarketValue,
  );
  const totalGainLossPct =
    account.totalGainLoss !== null
    && account.totalCostBasis !== null
    && account.totalCostBasis > 0
      ? (account.totalGainLoss / account.totalCostBasis) * 100
      : null;
  const concentration = getConcentrationSummary({
    holdingCount: account.holdingCount,
    topHoldingWeightPct,
    topThreeHoldingsWeightPct,
  });

  return {
    accountId: account.accountId,
    accountDisplayName: account.accountDisplayName,
    ownerDisplayName: account.ownerDisplayName,
    sourceName: account.sourceName,
    snapshotDate: account.snapshotDate,
    importCreatedAt: account.importCreatedAt,
    holdingCount: account.holdingCount,
    holdingsWithCostBasisCount,
    totalMarketValue: account.totalMarketValue,
    totalCostBasis: account.totalCostBasis,
    totalGainLoss: account.totalGainLoss,
    totalGainLossPct,
    portfolioSharePct,
    topHoldingName: topHolding?.assetName ?? null,
    topHoldingSymbol: topHolding?.assetSymbol ?? null,
    topHoldingMarketValue: topHolding?.marketValue ?? null,
    topHoldingWeightPct,
    topThreeHoldingsWeightPct,
    concentrationHint: concentration.concentrationHint,
    concentrationLevel: concentration.concentrationLevel,
  };
}

function compareSnapshotDate(left: string, right: string) {
  return left.localeCompare(right);
}

function buildPortfolioSummary(
  accounts: InvestmentAccountHoldingsSnapshot[],
  accountOverviews: InvestmentAccountOverview[],
): InvestmentPortfolioSummary {
  let holdingCount = 0;
  let holdingsWithCostBasisCount = 0;
  let totalMarketValue = 0;
  let totalCostBasis: number | null = null;
  let totalGainLoss: number | null = null;
  let oldestSnapshotDate: string | null = null;
  let latestSnapshotDate: string | null = null;
  let topHolding: InvestmentPortfolioHoldingLeader | null = null;

  for (const account of accounts) {
    holdingCount += account.holdingCount;
    totalMarketValue += account.totalMarketValue;
    totalCostBasis = addNullableNumber(totalCostBasis, account.totalCostBasis);
    totalGainLoss = addNullableNumber(totalGainLoss, account.totalGainLoss);

    if (!oldestSnapshotDate || compareSnapshotDate(account.snapshotDate, oldestSnapshotDate) < 0) {
      oldestSnapshotDate = account.snapshotDate;
    }

    if (!latestSnapshotDate || compareSnapshotDate(account.snapshotDate, latestSnapshotDate) > 0) {
      latestSnapshotDate = account.snapshotDate;
    }

    for (const holding of account.holdings) {
      if (holding.costBasis !== null) {
        holdingsWithCostBasisCount += 1;
      }

      if (!topHolding || holding.marketValue > topHolding.marketValue) {
        topHolding = {
          accountId: account.accountId,
          accountDisplayName: account.accountDisplayName,
          assetName: holding.assetName,
          assetSymbol: holding.assetSymbol,
          marketValue: holding.marketValue,
          portfolioWeightPct: null,
        };
      }
    }
  }

  if (topHolding) {
    topHolding = {
      ...topHolding,
      portfolioWeightPct: toPercentage(topHolding.marketValue, totalMarketValue),
    };
  }

  const largestAccount = accountOverviews[0]
    ? {
        accountId: accountOverviews[0].accountId,
        accountDisplayName: accountOverviews[0].accountDisplayName,
        totalMarketValue: accountOverviews[0].totalMarketValue,
        portfolioSharePct: accountOverviews[0].portfolioSharePct,
      }
    : null;
  const totalGainLossPct =
    totalGainLoss !== null && totalCostBasis !== null && totalCostBasis > 0
      ? (totalGainLoss / totalCostBasis) * 100
      : null;

  return {
    accountCount: accounts.length,
    holdingCount,
    holdingsWithCostBasisCount,
    totalMarketValue,
    totalCostBasis,
    totalGainLoss,
    totalGainLossPct,
    oldestSnapshotDate,
    latestSnapshotDate,
    largestAccount,
    topHolding,
  };
}

export function buildInvestmentPortfolioReport(
  accounts: InvestmentAccountHoldingsSnapshot[],
): InvestmentPortfolioReport {
  const portfolioMarketValue = accounts.reduce(
    (sum, account) => sum + account.totalMarketValue,
    0,
  );
  const accountOverviews = accounts
    .map((account) => buildAccountOverview(account, portfolioMarketValue))
    .sort((left, right) => {
      if (right.totalMarketValue !== left.totalMarketValue) {
        return right.totalMarketValue - left.totalMarketValue;
      }

      return left.accountDisplayName.localeCompare(right.accountDisplayName);
    });

  return {
    summary: buildPortfolioSummary(accounts, accountOverviews),
    accountOverviews,
  };
}
