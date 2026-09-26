"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type KeyboardEvent } from "react";

import { InvestmentAccountTiles } from "@/components/investments/investment-account-tiles";
import { InvestmentHoldingsBoard } from "@/components/investments/investment-holdings-board";
import { InvestmentOverview } from "@/components/investments/investment-overview";
import {
  InvestmentUpdateSheet,
  type InvestmentUpdateResult,
} from "@/components/investments/investment-update-sheet";
import { changeTone, formatSignedMoney, formatSignedPercent } from "@/components/investments/format";
import {
  INVESTMENT_ACCOUNT_STALE_AFTER_DAYS,
  buildInvestmentPortfolioSummary,
  daysSinceSnapshot,
} from "@/features/investments/holdings-table";
import type { InvestmentAccountHoldingsSnapshot } from "@/features/investments/types";
import type { WorkspaceMemberSettingsItem } from "@/features/workspaces/types";
import { formatMoneyWithCurrency } from "@/lib/money/format";

type InvestmentsPageClientProps = {
  initialAccounts: InvestmentAccountHoldingsSnapshot[];
  members: WorkspaceMemberSettingsItem[];
  currentMemberId: string;
  workspaceCurrency: string;
};

type UpdateSession = {
  id: number;
  account: InvestmentAccountHoldingsSnapshot | null;
  file: File | null;
};

const HIGHLIGHT_DURATION_MS = 2400;

const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "holdings", label: "Holdings" },
  { id: "accounts", label: "Accounts" },
] as const;

type InvestmentsView = (typeof VIEWS)[number]["id"];

function parseView(value: string | null): InvestmentsView {
  return VIEWS.find((view) => view.id === value)?.id ?? "overview";
}

export function InvestmentsPageClient({
  initialAccounts,
  members,
  currentMemberId,
  workspaceCurrency,
}: InvestmentsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = parseView(searchParams.get("view"));
  const [accounts, setAccounts] = useState(initialAccounts);
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [session, setSession] = useState<UpdateSession | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "warning" } | null>(null);
  const [highlightedAccountId, setHighlightedAccountId] = useState<string | null>(null);

  useEffect(() => {
    setAccounts(initialAccounts);
  }, [initialAccounts]);

  useEffect(() => {
    if (!highlightedAccountId) {
      return;
    }

    const timeout = window.setTimeout(() => setHighlightedAccountId(null), HIGHLIGHT_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [highlightedAccountId]);

  const owners = members.filter(
    (member) => accounts.some((account) => account.ownerMemberId === member.id),
  );
  const activeOwner = owners.some((member) => member.id === ownerFilter) ? ownerFilter : null;
  const scopedAccounts = activeOwner
    ? accounts.filter((account) => account.ownerMemberId === activeOwner)
    : accounts;
  const showOwner = activeOwner === null && owners.length > 1;
  const summary = buildInvestmentPortfolioSummary(accounts, activeOwner);
  const today = new Date();
  const staleAccountCount = scopedAccounts.filter((account) => {
    const days = daysSinceSnapshot(account.snapshotDate, today);
    return days !== null && days > INVESTMENT_ACCOUNT_STALE_AFTER_DAYS;
  }).length;

  function selectView(next: InvestmentsView) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") {
      params.delete("view");
    } else {
      params.set("view", next);
    }
    const query = params.toString();
    window.history.pushState(null, "", query ? `?${query}` : window.location.pathname);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!offset) {
      return;
    }

    event.preventDefault();
    const index = VIEWS.findIndex((item) => item.id === view);
    const next = VIEWS[(index + offset + VIEWS.length) % VIEWS.length];
    if (next) {
      selectView(next.id);
      document.getElementById(`investments-tab-${next.id}`)?.focus();
    }
  }

  function openUpdate(account: InvestmentAccountHoldingsSnapshot | null, file: File | null) {
    setNotice(null);
    setSession((current) => ({ id: (current?.id ?? 0) + 1, account, file }));
    setIsSheetOpen(true);
  }

  function handleSaved(result: InvestmentUpdateResult) {
    if (result.accounts) {
      setAccounts(result.accounts);
    }
    setNotice({ message: result.message, tone: result.tone });
    setHighlightedAccountId(result.accountId);
    setIsSheetOpen(false);
    router.refresh();
  }

  return (
    <section className="stack">
      {accounts.length > 0 ? (
        <section className="investment-summary" aria-label="Portfolio summary">
          <div className="investment-summary-total">
            <span className="muted-text">
              {activeOwner
                ? owners.find((member) => member.id === activeOwner)?.displayName
                : owners.length > 1 ? "Household portfolio" : "Portfolio"}
            </span>
            <strong>{formatMoneyWithCurrency(summary.totalMarketValue, workspaceCurrency)}</strong>
            <span className="muted-text">
              {summary.accountCount} {summary.accountCount === 1 ? "account" : "accounts"}, each as of its latest export
            </span>
          </div>

          <dl className="investment-summary-figures">
            {summary.changeSincePrevious !== null ? (
              <div>
                <dt>Since previous exports</dt>
                <dd className={changeTone(summary.changeSincePrevious)}>
                  {formatSignedMoney(summary.changeSincePrevious, workspaceCurrency)}
                </dd>
                {summary.comparedAccountCount < summary.accountCount ? (
                  <span className="table-note">
                    {summary.comparedAccountCount} of {summary.accountCount} accounts have an earlier export
                  </span>
                ) : null}
              </div>
            ) : null}
            {summary.totalGainLoss !== null ? (
              <div>
                <dt>Unrealized gain/loss</dt>
                <dd className={changeTone(summary.totalGainLoss)}>
                  {formatSignedMoney(summary.totalGainLoss, workspaceCurrency)}
                </dd>
                <span className="table-note">{formatSignedPercent(summary.totalGainLossPct)}</span>
              </div>
            ) : null}
          </dl>

          {owners.length > 1 ? (
            <div className="statement-filters investment-owner-switch" role="group" aria-label="Show portfolio for">
              <button
                type="button"
                className="statement-filter"
                aria-pressed={activeOwner === null}
                onClick={() => setOwnerFilter(null)}
              >
                Combined
              </button>
              {owners.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="statement-filter"
                  aria-pressed={activeOwner === member.id}
                  onClick={() => setOwnerFilter(member.id)}
                >
                  {member.displayName}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {notice ? (
        <p className={`status ${notice.tone}`} role="status">
          {notice.message}
        </p>
      ) : null}

      {accounts.length === 0 ? (
        <InvestmentAccountTiles
          accounts={scopedAccounts}
          showOwner={showOwner}
          workspaceCurrency={workspaceCurrency}
          highlightedAccountId={highlightedAccountId}
          onUpdate={openUpdate}
        />
      ) : (
        <>
          <div className="investments-tabbar">
            <div className="investments-tabs" role="tablist" aria-label="Investments view">
              {VIEWS.map((item) => (
                <button
                  key={item.id}
                  id={`investments-tab-${item.id}`}
                  type="button"
                  role="tab"
                  className="investments-tab"
                  aria-selected={view === item.id}
                  aria-controls={`investments-panel-${item.id}`}
                  tabIndex={view === item.id ? 0 : -1}
                  onClick={() => selectView(item.id)}
                  onKeyDown={handleTabKeyDown}
                >
                  {item.label}
                  {item.id === "accounts" && staleAccountCount > 0 ? (
                    <span className="investments-tab-badge" aria-label={`${staleAccountCount} need an update`}>
                      {staleAccountCount}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <button className="button button-compact" type="button" onClick={() => openUpdate(null, null)}>
              Update<span className="investments-update-suffix"> from export</span>
            </button>
          </div>

          <div
            id={`investments-panel-${view}`}
            role="tabpanel"
            aria-labelledby={`investments-tab-${view}`}
          >
            {view === "overview" ? (
              <InvestmentOverview
                accounts={scopedAccounts}
                showOwner={showOwner}
                staleAccountCount={staleAccountCount}
                workspaceCurrency={workspaceCurrency}
                onShowAccounts={() => selectView("accounts")}
                onShowHoldings={() => selectView("holdings")}
              />
            ) : view === "holdings" ? (
              <InvestmentHoldingsBoard
                accounts={accounts}
                ownerMemberId={activeOwner}
                showOwner={showOwner}
                workspaceCurrency={workspaceCurrency}
              />
            ) : (
              <InvestmentAccountTiles
                accounts={scopedAccounts}
                showOwner={showOwner}
                workspaceCurrency={workspaceCurrency}
                highlightedAccountId={highlightedAccountId}
                onUpdate={openUpdate}
              />
            )}
          </div>
        </>
      )}

      {session ? (
        <InvestmentUpdateSheet
          key={session.id}
          open={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          onSaved={handleSaved}
          initialFile={session.file}
          targetAccount={session.account}
          accounts={accounts}
          members={members}
          currentMemberId={currentMemberId}
          workspaceCurrency={workspaceCurrency}
        />
      ) : null}
    </section>
  );
}
