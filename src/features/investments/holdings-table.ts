import type {
  InvestmentAccountHoldingsSnapshot,
  InvestmentAssetType,
} from "@/features/investments/types";

export const INVESTMENT_ACCOUNT_STALE_AFTER_DAYS = 45;

export type InvestmentHoldingRow = {
  ownerMemberId: string | null;
  ownerDisplayName: string;
  accountId: string;
  accountDisplayName: string;
  sourceName: string | null;
  snapshotDate: string;
  assetName: string;
  securityId: string | null;
  marketValue: number;
  portfolioSharePct: number | null;
};

function sharePct(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return null;
  }

  return (value / total) * 100;
}

export function buildInvestmentHoldingRows(
  accounts: InvestmentAccountHoldingsSnapshot[],
  ownerMemberId: string | null,
): InvestmentHoldingRow[] {
  const rows = includedAccounts(accounts, ownerMemberId).flatMap((account) =>
    account.holdings.map((holding) => ({
      ownerMemberId: account.ownerMemberId,
      ownerDisplayName: account.ownerDisplayName ?? "Unassigned",
      accountId: account.accountId,
      accountDisplayName: account.accountDisplayName,
      sourceName: account.sourceName,
      snapshotDate: account.snapshotDate,
      assetName: holding.assetName,
      securityId: holding.assetSymbol,
      marketValue: holding.marketValue,
    })),
  );
  const total = rows.reduce((sum, row) => sum + row.marketValue, 0);

  return rows
    .map((row) => ({
      ...row,
      portfolioSharePct: sharePct(row.marketValue, total),
    }))
    .sort((left, right) => right.marketValue - left.marketValue || left.assetName.localeCompare(right.assetName));
}

export type InvestmentPositionHolding = {
  accountId: string;
  accountDisplayName: string;
  ownerDisplayName: string;
  sourceName: string | null;
  marketValue: number;
  gainLoss: number | null;
};

export type InvestmentPositionRow = {
  key: string;
  assetName: string;
  securityId: string | null;
  assetType: InvestmentAssetType;
  marketValue: number;
  gainLoss: number | null;
  gainLossPct: number | null;
  portfolioSharePct: number | null;
  holdings: InvestmentPositionHolding[];
};

export type InvestmentPortfolioSummaryView = {
  accountCount: number;
  totalMarketValue: number;
  totalGainLoss: number | null;
  totalGainLossPct: number | null;
  changeSincePrevious: number | null;
  comparedAccountCount: number;
};

function includedAccounts(accounts: InvestmentAccountHoldingsSnapshot[], ownerMemberId: string | null) {
  return ownerMemberId
    ? accounts.filter((account) => account.ownerMemberId === ownerMemberId)
    : accounts;
}

// Gain/loss is stored in ILS while cost basis stays in the security's currency,
// so the return percentage is derived from ILS value and ILS gain only.
export function gainLossPct(marketValue: number, gainLoss: number | null) {
  if (gainLoss === null) {
    return null;
  }

  const invested = marketValue - gainLoss;

  if (!Number.isFinite(invested) || invested <= 0) {
    return null;
  }

  return (gainLoss / invested) * 100;
}

function positionKey(assetName: string, securityId: string | null) {
  const id = securityId?.trim();

  return id ? `id:${id}` : `name:${assetName.normalize("NFKC").trim().toLowerCase()}`;
}

export function buildInvestmentPositionRows(
  accounts: InvestmentAccountHoldingsSnapshot[],
  ownerMemberId: string | null,
): InvestmentPositionRow[] {
  const positions = new Map<string, Omit<InvestmentPositionRow, "gainLossPct" | "portfolioSharePct"> & {
    missingGainLoss: boolean;
  }>();

  for (const account of includedAccounts(accounts, ownerMemberId)) {
    for (const holding of account.holdings) {
      const key = positionKey(holding.assetName, holding.assetSymbol);
      const position = positions.get(key) ?? {
        key,
        assetName: holding.assetName,
        securityId: holding.assetSymbol,
        assetType: holding.assetType,
        marketValue: 0,
        gainLoss: null,
        missingGainLoss: false,
        holdings: [],
      };

      position.marketValue += holding.marketValue;
      if (holding.gainLoss === null) {
        position.missingGainLoss = true;
      } else {
        position.gainLoss = (position.gainLoss ?? 0) + holding.gainLoss;
      }
      position.holdings.push({
        accountId: account.accountId,
        accountDisplayName: account.accountDisplayName,
        ownerDisplayName: account.ownerDisplayName ?? "Unassigned",
        sourceName: account.sourceName,
        marketValue: holding.marketValue,
        gainLoss: holding.gainLoss,
      });
      positions.set(key, position);
    }
  }

  const total = [...positions.values()].reduce((sum, position) => sum + position.marketValue, 0);

  return [...positions.values()]
    .map(({ missingGainLoss, ...position }) => {
      const gainLoss = missingGainLoss ? null : position.gainLoss;

      return {
        ...position,
        gainLoss,
        gainLossPct: gainLossPct(position.marketValue, gainLoss),
        portfolioSharePct: sharePct(position.marketValue, total),
        holdings: position.holdings.sort((left, right) => right.marketValue - left.marketValue),
      };
    })
    .sort((left, right) => right.marketValue - left.marketValue || left.assetName.localeCompare(right.assetName));
}

export function buildInvestmentPortfolioSummary(
  accounts: InvestmentAccountHoldingsSnapshot[],
  ownerMemberId: string | null,
): InvestmentPortfolioSummaryView {
  const scoped = includedAccounts(accounts, ownerMemberId);
  const totalMarketValue = scoped.reduce((sum, account) => sum + account.totalMarketValue, 0);
  const hasCompleteGainLoss = scoped.length > 0
    && scoped.every((account) => account.holdings.every((holding) => holding.gainLoss !== null));
  const totalGainLoss = hasCompleteGainLoss
    ? scoped.reduce((sum, account) => sum + (account.totalGainLoss ?? 0), 0)
    : null;
  const compared = scoped.filter((account) => account.previousTotalMarketValue !== null);

  return {
    accountCount: scoped.length,
    totalMarketValue,
    totalGainLoss,
    totalGainLossPct: gainLossPct(totalMarketValue, totalGainLoss),
    changeSincePrevious: compared.length > 0
      ? compared.reduce(
          (sum, account) => sum + account.totalMarketValue - (account.previousTotalMarketValue ?? 0),
          0,
        )
      : null,
    comparedAccountCount: compared.length,
  };
}

export function daysSinceSnapshot(snapshotDate: string, today: Date) {
  const snapshot = Date.parse(`${snapshotDate}T00:00:00Z`);

  if (Number.isNaN(snapshot)) {
    return null;
  }

  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  return Math.max(0, Math.round((todayUtc - snapshot) / 86_400_000));
}

export function buildInvestmentHoldingsWorkbookRows(rows: InvestmentHoldingRow[]) {
  return [
    ["Owner", "Account", "Asset", "Security number", "Market value (ILS)", "Portfolio %", "Snapshot date"],
    ...rows.map((row) => [
      row.ownerDisplayName,
      row.accountDisplayName,
      row.assetName,
      row.securityId ?? "",
      row.marketValue,
      row.portfolioSharePct === null ? "" : Number(row.portfolioSharePct.toFixed(2)),
      row.snapshotDate,
    ]),
  ];
}

export function buildInvestmentExportFilename(scopeLabel: string) {
  const slug = scopeLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `investments-${slug || "member"}.xlsx`;
}
