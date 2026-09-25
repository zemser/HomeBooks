"use client";

import { useState, type DragEvent } from "react";

import {
  changeTone,
  formatDaysAgo,
  formatSignedMoney,
  formatSnapshotDate,
} from "@/components/investments/format";
import {
  INVESTMENT_ACCOUNT_STALE_AFTER_DAYS,
  daysSinceSnapshot,
} from "@/features/investments/holdings-table";
import type { InvestmentAccountHoldingsSnapshot } from "@/features/investments/types";
import { formatMoneyWithCurrency } from "@/lib/money/format";

type InvestmentAccountTilesProps = {
  accounts: InvestmentAccountHoldingsSnapshot[];
  showOwner: boolean;
  workspaceCurrency: string;
  highlightedAccountId: string | null;
  onUpdate: (account: InvestmentAccountHoldingsSnapshot | null, file: File | null) => void;
};

function droppedFile(event: DragEvent) {
  return event.dataTransfer.files?.[0] ?? null;
}

function useFileDrop(onFile: (file: File) => void) {
  const [isOver, setIsOver] = useState(false);

  return {
    isOver,
    handlers: {
      onDragEnter: (event: DragEvent) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setIsOver(true);
        }
      },
      onDragOver: (event: DragEvent) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      },
      onDragLeave: (event: DragEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOver(false);
        }
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        setIsOver(false);
        const file = droppedFile(event);
        if (file) {
          onFile(file);
        }
      },
    },
  };
}

function AccountTile({
  account,
  showOwner,
  workspaceCurrency,
  isHighlighted,
  onUpdate,
}: {
  account: InvestmentAccountHoldingsSnapshot;
  showOwner: boolean;
  workspaceCurrency: string;
  isHighlighted: boolean;
  onUpdate: InvestmentAccountTilesProps["onUpdate"];
}) {
  const { isOver, handlers } = useFileDrop((file) => onUpdate(account, file));
  const days = daysSinceSnapshot(account.snapshotDate, new Date());
  const isStale = days !== null && days > INVESTMENT_ACCOUNT_STALE_AFTER_DAYS;
  const change = account.previousTotalMarketValue === null
    ? null
    : account.totalMarketValue - account.previousTotalMarketValue;

  return (
    <article
      className={`investment-account-tile${isOver ? " is-drop-target" : ""}${isHighlighted ? " is-just-updated" : ""}`}
      data-testid="investment-account-tile"
      {...handlers}
    >
      <header>
        <span className="eyebrow">
          {showOwner ? `${account.ownerDisplayName ?? "Unassigned"} · ` : ""}
          {account.sourceName ?? "Investments"}
        </span>
        <h3 dir="auto">{account.accountDisplayName}</h3>
      </header>

      <div className="investment-account-value">
        <strong>{formatMoneyWithCurrency(account.totalMarketValue, workspaceCurrency)}</strong>
        {change !== null ? (
          <span className={changeTone(change)}>
            {formatSignedMoney(change, workspaceCurrency)} since{" "}
            {formatSnapshotDate(account.previousSnapshotDate)}
          </span>
        ) : null}
      </div>

      <footer>
        <span className={`investment-freshness${isStale ? " is-stale" : ""}`}>
          {isStale ? "Needs an update · " : ""}
          {formatSnapshotDate(account.snapshotDate)}
          {days !== null ? ` · ${formatDaysAgo(days)}` : ""}
        </span>
        <button
          className="button button-secondary button-compact"
          type="button"
          onClick={() => onUpdate(account, null)}
        >
          Update
        </button>
      </footer>

      {isOver ? <span className="investment-drop-hint">Drop to update this account</span> : null}
    </article>
  );
}

function AddAccountTile({ onUpdate, isOnly }: { onUpdate: InvestmentAccountTilesProps["onUpdate"]; isOnly: boolean }) {
  const { isOver, handlers } = useFileDrop((file) => onUpdate(null, file));

  return (
    <button
      type="button"
      className={`investment-account-tile investment-add-tile${isOver ? " is-drop-target" : ""}${isOnly ? " is-only" : ""}`}
      onClick={() => onUpdate(null, null)}
      {...handlers}
    >
      <strong>{isOnly ? "Add your first investment export" : "Add account"}</strong>
      <span className="muted-text">
        {isOnly
          ? "Upload an Excellence or bank portfolio export, or drop the Excel file here."
          : "Drop an export here or choose a file."}
      </span>
    </button>
  );
}

export function InvestmentAccountTiles({
  accounts,
  showOwner,
  workspaceCurrency,
  highlightedAccountId,
  onUpdate,
}: InvestmentAccountTilesProps) {
  const sortedAccounts = [...accounts].sort(
    (left, right) =>
      (left.ownerDisplayName ?? "").localeCompare(right.ownerDisplayName ?? "")
      || right.totalMarketValue - left.totalMarketValue,
  );

  return (
    <section className="investment-account-tiles" aria-label="Accounts">
      {sortedAccounts.map((account) => (
        <AccountTile
          key={account.accountId}
          account={account}
          showOwner={showOwner}
          workspaceCurrency={workspaceCurrency}
          isHighlighted={account.accountId === highlightedAccountId}
          onUpdate={onUpdate}
        />
      ))}
      <AddAccountTile onUpdate={onUpdate} isOnly={accounts.length === 0} />
    </section>
  );
}
