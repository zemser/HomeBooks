"use client";

import { useState } from "react";

import { buildInvestmentHoldingRows } from "@/features/investments/holdings-table";
import type { InvestmentAccountHoldingsSnapshot } from "@/features/investments/types";
import type { WorkspaceMemberSettingsItem } from "@/features/workspaces/types";
import { formatMoneyWithCurrency } from "@/lib/money/format";

type InvestmentHoldingsBoardProps = {
  accounts: InvestmentAccountHoldingsSnapshot[];
  members: WorkspaceMemberSettingsItem[];
  workspaceCurrency: string;
};

function formatPercent(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${new Intl.NumberFormat("en", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function formatSnapshotDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

export function InvestmentHoldingsBoard({
  accounts,
  members,
  workspaceCurrency,
}: InvestmentHoldingsBoardProps) {
  const [ownerFilter, setOwnerFilter] = useState("all");
  const ownerMemberId = ownerFilter === "all" ? null : ownerFilter;
  const rows = buildInvestmentHoldingRows(accounts, ownerMemberId);
  const totalMarketValue = rows.reduce((sum, row) => sum + row.marketValue, 0);
  const visibleMembers = members.filter(
    (member) => member.isActive || accounts.some((account) => account.ownerMemberId === member.id),
  );
  const selectedMember = visibleMembers.find((member) => member.id === ownerFilter) ?? null;
  const exportParams = new URLSearchParams();

  if (ownerMemberId) {
    exportParams.set("ownerMemberId", ownerMemberId);
  }

  const exportHref = exportParams.size > 0
    ? `/api/investments/export?${exportParams.toString()}`
    : "/api/investments/export";

  return (
    <article className="card stack compact" data-testid="investment-holdings">
      <div className="page-actions">
        <div>
          <h2>Holdings</h2>
          <p className="muted-text">
            Latest snapshot for each account.
            {selectedMember
              ? ` Showing ${selectedMember.displayName} only.`
              : " Showing every saved account together."}
            {" "}
            Percentages are the share of this view.
          </p>
        </div>
        <a className="button button-secondary" href={exportHref}>
          Export
        </a>
      </div>

      <label className="field">
        <span>Show</span>
        <select
          className="input"
          value={ownerFilter}
          onChange={(event) => setOwnerFilter(event.target.value)}
        >
          <option value="all">Combined</option>
          {visibleMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
              {member.isActive ? "" : " (inactive)"}
            </option>
          ))}
        </select>
      </label>

      {rows.length === 0 ? (
        <p className="empty-state">No saved holdings for this view yet.</p>
      ) : (
        <>
          <p className="helper-text">
            {formatMoneyWithCurrency(totalMarketValue, workspaceCurrency)} across {rows.length}{" "}
            {rows.length === 1 ? "holding" : "holdings"}.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Account</th>
                  <th>Asset</th>
                  <th>Security number</th>
                  <th>Market value</th>
                  <th>Portfolio</th>
                  <th>As of</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.accountId}-${row.securityId ?? row.assetName}`}>
                    <td>{row.ownerDisplayName}</td>
                    <td>
                      {row.accountDisplayName}
                      {row.sourceName ? <div className="table-note">{row.sourceName}</div> : null}
                    </td>
                    <td>
                      <strong>{row.assetName}</strong>
                    </td>
                    <td>{row.securityId ?? "-"}</td>
                    <td>{formatMoneyWithCurrency(row.marketValue, workspaceCurrency)}</td>
                    <td>{formatPercent(row.portfolioSharePct)}</td>
                    <td>{formatSnapshotDate(row.snapshotDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </article>
  );
}
