import type {
  InvestmentAccountHoldingsSnapshot,
  InvestmentAccountOverview,
  InvestmentAssetMixItem,
  InvestmentAssetType,
  InvestmentOwnerOverview,
  InvestmentPortfolioHoldingLeader,
  InvestmentPortfolioReport,
  InvestmentPortfolioSummary,
  InvestmentTopPosition,
} from "@/features/investments/types";
import { getInvestmentAssetTypeLabel } from "@/features/investments/classification";

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

function normalizePortfolioPositionName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function normalizePortfolioPositionSymbol(value: string | null) {
  return value?.trim().toLocaleLowerCase("en-US") ?? "";
}

function buildPortfolioPositionKey(input: {
  assetName: string;
  assetSymbol: string | null;
}) {
  const normalizedSymbol = normalizePortfolioPositionSymbol(input.assetSymbol);

  if (normalizedSymbol) {
    return `symbol:${normalizedSymbol}`;
  }

  return `name:${normalizePortfolioPositionName(input.assetName)}`;
}

function buildAssetMix(
  accounts: InvestmentAccountHoldingsSnapshot[],
  portfolioMarketValue: number,
): InvestmentAssetMixItem[] {
  const mixByType = new Map<
    InvestmentAssetType,
    {
      assetType: InvestmentAssetType;
      totalMarketValue: number;
      holdingCount: number;
      estimatedHoldingCount: number;
      accountIds: Set<string>;
    }
  >();

  for (const account of accounts) {
    for (const holding of account.holdings) {
      const current = mixByType.get(holding.assetType) ?? {
        assetType: holding.assetType,
        totalMarketValue: 0,
        holdingCount: 0,
        estimatedHoldingCount: 0,
        accountIds: new Set<string>(),
      };

      current.totalMarketValue += holding.marketValue;
      current.holdingCount += 1;
      current.accountIds.add(account.accountId);

      if (holding.assetTypeSource === "estimated") {
        current.estimatedHoldingCount += 1;
      }

      mixByType.set(holding.assetType, current);
    }
  }

  return [...mixByType.values()]
    .map((item) => ({
      assetType: item.assetType,
      assetTypeLabel: getInvestmentAssetTypeLabel(item.assetType),
      totalMarketValue: item.totalMarketValue,
      portfolioSharePct: toPercentage(item.totalMarketValue, portfolioMarketValue),
      holdingCount: item.holdingCount,
      accountCount: item.accountIds.size,
      estimatedHoldingCount: item.estimatedHoldingCount,
    }))
    .sort((left, right) => {
      if (right.totalMarketValue !== left.totalMarketValue) {
        return right.totalMarketValue - left.totalMarketValue;
      }

      return left.assetTypeLabel.localeCompare(right.assetTypeLabel);
    });
}

function buildOwnerOverviews(
  accounts: InvestmentAccountHoldingsSnapshot[],
  portfolioMarketValue: number,
): InvestmentOwnerOverview[] {
  const owners = new Map<
    string,
    {
      ownerKey: string;
      ownerMemberId: string | null;
      ownerDisplayName: string;
      accountCount: number;
      holdingCount: number;
      totalMarketValue: number;
      latestSnapshotDate: string | null;
      assetTypeMarketValue: Map<InvestmentAssetType, number>;
    }
  >();

  for (const account of accounts) {
    const ownerKey = account.ownerMemberId ?? "unassigned";
    const current = owners.get(ownerKey) ?? {
      ownerKey,
      ownerMemberId: account.ownerMemberId,
      ownerDisplayName: account.ownerDisplayName ?? "Unassigned",
      accountCount: 0,
      holdingCount: 0,
      totalMarketValue: 0,
      latestSnapshotDate: null,
      assetTypeMarketValue: new Map<InvestmentAssetType, number>(),
    };

    current.accountCount += 1;
    current.holdingCount += account.holdingCount;
    current.totalMarketValue += account.totalMarketValue;

    if (
      !current.latestSnapshotDate
      || compareSnapshotDate(account.snapshotDate, current.latestSnapshotDate) > 0
    ) {
      current.latestSnapshotDate = account.snapshotDate;
    }

    for (const holding of account.holdings) {
      current.assetTypeMarketValue.set(
        holding.assetType,
        (current.assetTypeMarketValue.get(holding.assetType) ?? 0) + holding.marketValue,
      );
    }

    owners.set(ownerKey, current);
  }

  return [...owners.values()]
    .map((owner) => {
      let dominantAssetType: InvestmentAssetType | null = null;
      let dominantAssetTypeValue = 0;

      for (const [assetType, totalMarketValue] of owner.assetTypeMarketValue) {
        if (totalMarketValue > dominantAssetTypeValue) {
          dominantAssetType = assetType;
          dominantAssetTypeValue = totalMarketValue;
        }
      }

      return {
        ownerKey: owner.ownerKey,
        ownerMemberId: owner.ownerMemberId,
        ownerDisplayName: owner.ownerDisplayName,
        accountCount: owner.accountCount,
        holdingCount: owner.holdingCount,
        totalMarketValue: owner.totalMarketValue,
        portfolioSharePct: toPercentage(owner.totalMarketValue, portfolioMarketValue),
        latestSnapshotDate: owner.latestSnapshotDate,
        dominantAssetType,
        dominantAssetTypeLabel: dominantAssetType
          ? getInvestmentAssetTypeLabel(dominantAssetType)
          : null,
        dominantAssetTypeSharePct: dominantAssetType
          ? toPercentage(dominantAssetTypeValue, owner.totalMarketValue)
          : null,
      };
    })
    .sort((left, right) => {
      if (right.totalMarketValue !== left.totalMarketValue) {
        return right.totalMarketValue - left.totalMarketValue;
      }

      return left.ownerDisplayName.localeCompare(right.ownerDisplayName);
    });
}

function buildTopPositions(
  accounts: InvestmentAccountHoldingsSnapshot[],
  portfolioMarketValue: number,
): InvestmentTopPosition[] {
  const positions = new Map<
    string,
    {
      positionKey: string;
      assetName: string;
      assetSymbol: string | null;
      assetType: InvestmentAssetType;
      displayMarketValue: number;
      totalMarketValue: number;
      accountIds: Set<string>;
    }
  >();

  for (const account of accounts) {
    for (const holding of account.holdings) {
      const positionKey = buildPortfolioPositionKey({
        assetName: holding.assetName,
        assetSymbol: holding.assetSymbol,
      });
      const current = positions.get(positionKey) ?? {
        positionKey,
        assetName: holding.assetName,
        assetSymbol: holding.assetSymbol,
        assetType: holding.assetType,
        displayMarketValue: holding.marketValue,
        totalMarketValue: 0,
        accountIds: new Set<string>(),
      };

      if (holding.marketValue > current.displayMarketValue) {
        current.assetName = holding.assetName;
        current.displayMarketValue = holding.marketValue;
      }

      if (!current.assetSymbol && holding.assetSymbol) {
        current.assetSymbol = holding.assetSymbol;
      }

      current.totalMarketValue += holding.marketValue;
      current.accountIds.add(account.accountId);

      if (current.assetType === "other" && holding.assetType !== "other") {
        current.assetType = holding.assetType;
      }

      positions.set(positionKey, current);
    }
  }

  return [...positions.values()]
    .map((position) => ({
      positionKey: position.positionKey,
      assetName: position.assetName,
      assetSymbol: position.assetSymbol,
      assetType: position.assetType,
      assetTypeLabel: getInvestmentAssetTypeLabel(position.assetType),
      totalMarketValue: position.totalMarketValue,
      portfolioSharePct: toPercentage(position.totalMarketValue, portfolioMarketValue),
      accountCount: position.accountIds.size,
    }))
    .sort((left, right) => {
      if (right.totalMarketValue !== left.totalMarketValue) {
        return right.totalMarketValue - left.totalMarketValue;
      }

      return left.assetName.localeCompare(right.assetName);
    });
}

function buildPortfolioSummary(
  accounts: InvestmentAccountHoldingsSnapshot[],
  accountOverviews: InvestmentAccountOverview[],
): InvestmentPortfolioSummary {
  let holdingCount = 0;
  let holdingsWithCostBasisCount = 0;
  let estimatedAssetTypeCount = 0;
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

      if (holding.assetTypeSource === "estimated") {
        estimatedAssetTypeCount += 1;
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
    estimatedAssetTypeCount,
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
  const assetMix = buildAssetMix(accounts, portfolioMarketValue);
  const ownerOverviews = buildOwnerOverviews(accounts, portfolioMarketValue);
  const topPositions = buildTopPositions(accounts, portfolioMarketValue);
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
    assetMix,
    ownerOverviews,
    topPositions,
    accountOverviews,
  };
}
