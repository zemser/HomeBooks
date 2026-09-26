"use client";

import { formatPercent, formatWholeMoney } from "@/components/investments/format";
import { buildInvestmentPortfolioReport } from "@/features/investments/reporting";
import type {
  InvestmentAccountHoldingsSnapshot,
  InvestmentAssetType,
} from "@/features/investments/types";

type InvestmentOverviewProps = {
  accounts: InvestmentAccountHoldingsSnapshot[];
  showOwner: boolean;
  staleAccountCount: number;
  workspaceCurrency: string;
  onShowAccounts: () => void;
  onShowHoldings: () => void;
};

const TOP_POSITION_COUNT = 5;

function ShareBar({ pct, assetType }: { pct: number | null; assetType?: InvestmentAssetType }) {
  return (
    <span className="investment-share-bar" aria-hidden="true">
      <span
        className={assetType ? `investment-asset-${assetType}` : undefined}
        style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }}
      />
    </span>
  );
}

export function InvestmentOverview({
  accounts,
  showOwner,
  staleAccountCount,
  workspaceCurrency,
  onShowAccounts,
  onShowHoldings,
}: InvestmentOverviewProps) {
  if (accounts.length === 0) {
    return null;
  }

  const report = buildInvestmentPortfolioReport(accounts);
  const positionCount = report.topPositions.length;
  const topPositions = report.topPositions.slice(0, TOP_POSITION_COUNT);
  const largestPosition = report.topPositions[0] ?? null;
  const topThreeSharePct = report.topPositions
    .slice(0, 3)
    .reduce((sum, position) => sum + (position.portfolioSharePct ?? 0), 0);
  const estimatedCount = report.summary.estimatedAssetTypeCount;

  return (
    <div className="investment-overview">
      {staleAccountCount > 0 ? (
        <p className="status warning investment-overview-notice">
          <span>
            {staleAccountCount === 1 ? "1 account hasn't" : `${staleAccountCount} accounts haven't`} been
            updated in over 45 days.
          </span>
          <button className="button button-secondary button-compact" type="button" onClick={onShowAccounts}>
            Review accounts
          </button>
        </p>
      ) : null}

      <section className="card investment-overview-card investment-overview-mix" aria-labelledby="investment-mix-title">
        <h2 id="investment-mix-title">Asset mix</h2>
        <div className="investment-mix-bar" role="img" aria-label={report.assetMix
          .map((item) => `${item.assetTypeLabel} ${formatPercent(item.portfolioSharePct)}`)
          .join(", ")}
        >
          {report.assetMix.map((item) => (
            <span
              key={item.assetType}
              className={`investment-asset-${item.assetType}`}
              style={{ flexGrow: item.totalMarketValue }}
            />
          ))}
        </div>
        <ul className="investment-mix-legend">
          {report.assetMix.map((item) => (
            <li key={item.assetType}>
              <span className={`investment-mix-swatch investment-asset-${item.assetType}`} aria-hidden="true" />
              <span className="investment-mix-label">{item.assetTypeLabel}</span>
              <span className="investment-mix-value">{formatWholeMoney(item.totalMarketValue, workspaceCurrency)}</span>
              <strong className="investment-mix-share">{formatPercent(item.portfolioSharePct)}</strong>
            </li>
          ))}
        </ul>
        {estimatedCount > 0 ? (
          <p className="table-note">
            {estimatedCount} {estimatedCount === 1 ? "holding's type is" : "holdings' types are"} estimated from
            the name.
          </p>
        ) : null}
      </section>

      <section className="card investment-overview-card" aria-labelledby="investment-concentration-title">
        <h2 id="investment-concentration-title">Concentration</h2>
        <dl className="investment-overview-facts">
          <div>
            <dt>Largest position</dt>
            <dd>{formatPercent(largestPosition?.portfolioSharePct ?? null)}</dd>
            {largestPosition ? <span className="table-note" dir="auto">{largestPosition.assetName}</span> : null}
          </div>
          <div>
            <dt>Top 3 positions</dt>
            <dd>{formatPercent(positionCount > 0 ? topThreeSharePct : null)}</dd>
          </div>
          <div>
            <dt>Positions</dt>
            <dd>{positionCount}</dd>
          </div>
        </dl>
      </section>

      <section className="card investment-overview-card" aria-labelledby="investment-top-title">
        <div className="investment-overview-card-header">
          <h2 id="investment-top-title">Largest positions</h2>
          <button className="investment-overview-link" type="button" onClick={onShowHoldings}>
            All holdings
          </button>
        </div>
        <ol className="investment-rank-list">
          {topPositions.map((position) => (
            <li key={position.positionKey}>
              <div className="investment-rank-row">
                <span dir="auto" className="investment-rank-name">{position.assetName}</span>
                <strong>{formatPercent(position.portfolioSharePct)}</strong>
              </div>
              <ShareBar pct={position.portfolioSharePct} assetType={position.assetType} />
              <span className="table-note">
                {position.assetTypeLabel} · {formatWholeMoney(position.totalMarketValue, workspaceCurrency)}
                {position.accountCount > 1 ? ` · ${position.accountCount} accounts` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card investment-overview-card" aria-labelledby="investment-accounts-title">
        <div className="investment-overview-card-header">
          <h2 id="investment-accounts-title">By account</h2>
          <button className="investment-overview-link" type="button" onClick={onShowAccounts}>
            Manage
          </button>
        </div>
        <ol className="investment-rank-list">
          {report.accountOverviews.map((account) => (
            <li key={account.accountId}>
              <div className="investment-rank-row">
                <span dir="auto" className="investment-rank-name">
                  {showOwner ? `${account.ownerDisplayName ?? "Unassigned"} · ` : ""}
                  {account.accountDisplayName}
                </span>
                <strong>{formatPercent(account.portfolioSharePct)}</strong>
              </div>
              <ShareBar pct={account.portfolioSharePct} />
              <span className="table-note">
                {formatWholeMoney(account.totalMarketValue, workspaceCurrency)} · {account.holdingCount}{" "}
                {account.holdingCount === 1 ? "position" : "positions"} · {account.concentrationHint}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {showOwner && report.ownerOverviews.length > 1 ? (
        <section className="card investment-overview-card" aria-labelledby="investment-owners-title">
          <h2 id="investment-owners-title">By person</h2>
          <ol className="investment-rank-list">
            {report.ownerOverviews.map((owner) => (
              <li key={owner.ownerKey}>
                <div className="investment-rank-row">
                  <span className="investment-rank-name">{owner.ownerDisplayName}</span>
                  <strong>{formatPercent(owner.portfolioSharePct)}</strong>
                </div>
                <ShareBar pct={owner.portfolioSharePct} />
                <span className="table-note">
                  {formatWholeMoney(owner.totalMarketValue, workspaceCurrency)}
                  {owner.dominantAssetTypeLabel
                    ? ` · mostly ${owner.dominantAssetTypeLabel.toLowerCase()} (${formatPercent(owner.dominantAssetTypeSharePct)})`
                    : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
