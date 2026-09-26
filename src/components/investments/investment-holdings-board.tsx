"use client";

import { Fragment, useState } from "react";

import { changeTone, formatPercent, formatSignedMoney, formatSignedPercent } from "@/components/investments/format";
import { getInvestmentAssetTypeLabel } from "@/features/investments/classification";
import {
  buildInvestmentPositionRows,
  type InvestmentPositionRow,
} from "@/features/investments/holdings-table";
import type { InvestmentAccountHoldingsSnapshot } from "@/features/investments/types";
import { formatMoneyWithCurrency } from "@/lib/money/format";

type InvestmentHoldingsBoardProps = {
  accounts: InvestmentAccountHoldingsSnapshot[];
  ownerMemberId: string | null;
  showOwner: boolean;
  workspaceCurrency: string;
};

type SortKey = "value" | "gain" | "name";

const SORT_LABELS: Record<SortKey, string> = {
  value: "Value",
  gain: "Gain/loss",
  name: "Name",
};

function sortPositions(rows: InvestmentPositionRow[], sortKey: SortKey) {
  if (sortKey === "value") {
    return rows;
  }

  return [...rows].sort((left, right) => {
    if (sortKey === "name") {
      return left.assetName.localeCompare(right.assetName);
    }

    return (right.gainLoss ?? Number.NEGATIVE_INFINITY) - (left.gainLoss ?? Number.NEGATIVE_INFINITY);
  });
}

function matchesQuery(row: InvestmentPositionRow, query: string) {
  if (!query) {
    return true;
  }

  const needle = query.normalize("NFKC").toLowerCase();

  return (
    row.assetName.normalize("NFKC").toLowerCase().includes(needle)
    || (row.securityId ?? "").toLowerCase().includes(needle)
  );
}

function heldInLabel(row: InvestmentPositionRow, showOwner: boolean) {
  if (row.holdings.length > 1) {
    return `${row.holdings.length} accounts`;
  }

  const holding = row.holdings[0];

  if (!holding) {
    return "-";
  }

  return showOwner ? `${holding.ownerDisplayName} · ${holding.accountDisplayName}` : holding.accountDisplayName;
}

export function InvestmentHoldingsBoard({
  accounts,
  ownerMemberId,
  showOwner,
  workspaceCurrency,
}: InvestmentHoldingsBoardProps) {
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [query, setQuery] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const positions = buildInvestmentPositionRows(accounts, ownerMemberId);
  const rows = sortPositions(positions, sortKey).filter((row) => matchesQuery(row, query.trim()));
  const exportHref = ownerMemberId
    ? `/api/investments/export?${new URLSearchParams({ ownerMemberId }).toString()}`
    : "/api/investments/export";

  function toggleExpanded(key: string) {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  if (positions.length === 0) {
    return null;
  }

  return (
    <article className="card stack compact" data-testid="investment-holdings">
      <div className="investment-holdings-header">
        <div>
          <h2>Holdings</h2>
          <p className="muted-text">
            {positions.length} {positions.length === 1 ? "position" : "positions"}. The same security
            held in several accounts is shown once.
          </p>
        </div>
        <a className="button button-secondary button-compact" href={exportHref}>
          Export
        </a>
      </div>

      <div className="investment-holdings-tools">
        <input
          className="input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or security number"
          aria-label="Search holdings"
        />
        <div className="statement-filters" role="group" aria-label="Sort holdings">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className="statement-filter"
              aria-pressed={sortKey === key}
              onClick={() => setSortKey(key)}
            >
              {SORT_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty-state">No holdings match “{query.trim()}”.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table investment-positions-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Held in</th>
                <th className="numeric-cell">Value</th>
                <th className="numeric-cell">Share</th>
                <th className="numeric-cell">Gain/loss</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const canExpand = row.holdings.length > 1;
                const isExpanded = canExpand && expandedKeys.has(row.key);

                return (
                  <Fragment key={row.key}>
                    <tr>
                      <td>
                        <strong dir="auto">{row.assetName}</strong>
                        <div className="table-note">
                          {getInvestmentAssetTypeLabel(row.assetType)}
                          {row.securityId ? ` · ${row.securityId}` : ""}
                        </div>
                      </td>
                      <td>
                        {canExpand ? (
                          <button
                            type="button"
                            className="investment-expand-button"
                            aria-expanded={isExpanded}
                            onClick={() => toggleExpanded(row.key)}
                          >
                            {heldInLabel(row, showOwner)}
                            <span aria-hidden="true" className="investment-expand-caret" />
                          </button>
                        ) : (
                          <span dir="auto">{heldInLabel(row, showOwner)}</span>
                        )}
                      </td>
                      <td className="numeric-cell">
                        {formatMoneyWithCurrency(row.marketValue, workspaceCurrency)}
                      </td>
                      <td className="numeric-cell">{formatPercent(row.portfolioSharePct)}</td>
                      <td className={`numeric-cell ${changeTone(row.gainLoss)}`}>
                        {row.gainLoss === null ? (
                          "-"
                        ) : (
                          <>
                            {formatSignedMoney(row.gainLoss, workspaceCurrency)}
                            <div className="table-note">{formatSignedPercent(row.gainLossPct)}</div>
                          </>
                        )}
                      </td>
                    </tr>
                    {isExpanded
                      ? row.holdings.map((holding) => (
                          <tr key={`${row.key}-${holding.accountId}`} className="investment-position-subrow">
                            <td />
                            <td dir="auto">
                              {showOwner ? `${holding.ownerDisplayName} · ` : ""}
                              {holding.accountDisplayName}
                            </td>
                            <td className="numeric-cell">
                              {formatMoneyWithCurrency(holding.marketValue, workspaceCurrency)}
                            </td>
                            <td />
                            <td className={`numeric-cell ${changeTone(holding.gainLoss)}`}>
                              {holding.gainLoss === null
                                ? "-"
                                : formatSignedMoney(holding.gainLoss, workspaceCurrency)}
                            </td>
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
