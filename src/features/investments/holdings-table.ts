import type { InvestmentAccountHoldingsSnapshot } from "@/features/investments/types";

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
  const includedAccounts = ownerMemberId
    ? accounts.filter((account) => account.ownerMemberId === ownerMemberId)
    : accounts;
  const rows = includedAccounts.flatMap((account) =>
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
