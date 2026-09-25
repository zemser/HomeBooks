"use client";

import { useEffect, useRef, useState } from "react";

import {
  changeTone,
  formatPercent,
  formatSignedMoney,
  formatSnapshotDate,
} from "@/components/investments/format";
import { Modal } from "@/components/shared/modal";
import { INVESTMENT_PROVIDER_SOURCE_NAME } from "@/features/investments/constants";
import type {
  InvestmentAccountHoldingsSnapshot,
  InvestmentPreviewResult,
} from "@/features/investments/types";
import { normalizeInvestmentAccountLabel } from "@/features/investments/utils";
import type { WorkspaceMemberSettingsItem } from "@/features/workspaces/types";
import { formatMoneyWithCurrency } from "@/lib/money/format";

export type InvestmentUpdateResult = {
  accounts: InvestmentAccountHoldingsSnapshot[] | null;
  message: string;
  tone: "success" | "warning";
  accountId: string | null;
};

type InvestmentSaveResponse = {
  status?: string;
  error?: string;
  accounts?: InvestmentAccountHoldingsSnapshot[];
};

type InvestmentUpdateSheetProps = {
  open: boolean;
  onClose: () => void;
  onSaved: (result: InvestmentUpdateResult) => void;
  initialFile: File | null;
  targetAccount: InvestmentAccountHoldingsSnapshot | null;
  accounts: InvestmentAccountHoldingsSnapshot[];
  members: WorkspaceMemberSettingsItem[];
  currentMemberId: string;
  workspaceCurrency: string;
};

const MAX_LISTED_CHANGES = 4;

function canonicalLabel(label: string) {
  try {
    return normalizeInvestmentAccountLabel(label);
  } catch {
    return null;
  }
}

function accountsWithLabel(
  accounts: InvestmentAccountHoldingsSnapshot[],
  provider: InvestmentPreviewResult["provider"],
  label: string,
) {
  const wanted = canonicalLabel(label);
  const sourceName = INVESTMENT_PROVIDER_SOURCE_NAME[provider];

  if (!wanted) {
    return [];
  }

  return accounts.filter(
    (account) =>
      account.sourceName === sourceName && canonicalLabel(account.accountDisplayName) === wanted,
  );
}

function holdingKey(name: string, securityId: string | null) {
  const id = securityId?.trim();

  return id ? `id:${id}` : `name:${name.normalize("NFKC").trim().toLowerCase()}`;
}

function describePositions(names: string[]) {
  const listed = names.slice(0, MAX_LISTED_CHANGES).join(", ");
  const rest = names.length - MAX_LISTED_CHANGES;

  return rest > 0 ? `${listed} and ${rest} more` : listed;
}

export function InvestmentUpdateSheet({
  open,
  onClose,
  onSaved,
  initialFile,
  targetAccount,
  accounts,
  members,
  currentMemberId,
  workspaceCurrency,
}: InvestmentUpdateSheetProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<InvestmentPreviewResult | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownerMemberId, setOwnerMemberId] = useState(targetAccount?.ownerMemberId ?? currentMemberId);
  const [accountLabel, setAccountLabel] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const initialFileRead = useRef(false);

  async function readFile(nextFile: File) {
    setFile(nextFile);
    setPreview(null);
    setError(null);
    setIsReading(true);

    const formData = new FormData();
    formData.append("file", nextFile);

    try {
      const response = await fetch("/api/investments/preview", { method: "POST", body: formData });
      const payload = (await response.json().catch(() => ({}))) as
        | InvestmentPreviewResult
        | { error?: string };

      if (!response.ok || !("provider" in payload)) {
        setError("error" in payload && payload.error ? payload.error : "Could not read this file.");
        return;
      }

      const sameLabel = payload.accountLabel
        ? accountsWithLabel(accounts, payload.provider, payload.accountLabel)
        : [];
      const detectedOwner = sameLabel.length === 1 ? sameLabel[0]?.ownerMemberId : null;

      setPreview(payload);
      setAccountLabel(payload.accountLabel ?? targetAccount?.accountDisplayName ?? "");
      setOwnerMemberId(targetAccount?.ownerMemberId ?? detectedOwner ?? currentMemberId);
      setShowDetails(!payload.accountLabel);
    } catch {
      setError("Could not read this file right now.");
    } finally {
      setIsReading(false);
    }
  }

  useEffect(() => {
    if (initialFile && !initialFileRead.current) {
      initialFileRead.current = true;
      void readFile(initialFile);
    }
    // Only the file handed over when the sheet opens is read automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  const matchingAccount = preview
    ? accountsWithLabel(accounts, preview.provider, accountLabel).find(
        (account) => account.ownerMemberId === ownerMemberId,
      ) ?? null
    : null;
  const ownerName = members.find((member) => member.id === ownerMemberId)?.displayName ?? "this member";
  const newTotal = preview?.holdings.reduce((sum, holding) => sum + (holding.marketValueIls ?? 0), 0) ?? 0;
  const previewKeys = new Set(
    preview?.holdings.map((holding) => holdingKey(holding.assetName, holding.securityId)),
  );
  const existingKeys = new Set(
    matchingAccount?.holdings.map((holding) => holdingKey(holding.assetName, holding.assetSymbol)),
  );
  const addedPositions = matchingAccount
    ? (preview?.holdings ?? [])
        .filter((holding) => !existingKeys.has(holdingKey(holding.assetName, holding.securityId)))
        .map((holding) => holding.assetName)
    : [];
  const removedPositions = matchingAccount
    ? matchingAccount.holdings
        .filter((holding) => !previewKeys.has(holdingKey(holding.assetName, holding.assetSymbol)))
        .map((holding) => holding.assetName)
    : [];
  const isOlderThanShown = Boolean(
    matchingAccount && preview?.snapshotDate && preview.snapshotDate < matchingAccount.snapshotDate,
  );
  const isSameDate = Boolean(
    matchingAccount && preview?.snapshotDate && preview.snapshotDate === matchingAccount.snapshotDate,
  );
  const pointsElsewhere = Boolean(
    preview && targetAccount && matchingAccount?.accountId !== targetAccount.accountId,
  );
  const canSaveToWorkspace = workspaceCurrency === "ILS";
  const canSave = Boolean(
    file && preview && ownerMemberId.trim() && accountLabel.trim() && canSaveToWorkspace && !isSaving,
  );

  async function handleSave() {
    if (!file || !preview) {
      return;
    }

    setIsSaving(true);
    setError(null);

    const label = accountLabel.trim();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("ownerMemberId", ownerMemberId);
    formData.append("accountLabel", label);

    try {
      const response = await fetch("/api/investments", { method: "POST", body: formData });
      const payload = (await response.json().catch(() => ({}))) as InvestmentSaveResponse;
      const savedAccountId =
        accountsWithLabel(payload.accounts ?? [], preview.provider, label).find(
          (account) => account.ownerMemberId === ownerMemberId,
        )?.accountId
        ?? matchingAccount?.accountId
        ?? null;

      if (response.status === 409 || payload.status === "duplicate") {
        onSaved({
          accounts: payload.accounts ?? null,
          message: `${ownerName} · ${matchingAccount?.accountDisplayName ?? label} is already up to date with this file.`,
          tone: "warning",
          accountId: savedAccountId,
        });
        return;
      }

      if (!response.ok) {
        setError(payload.error ?? "Could not save this export.");
        return;
      }

      onSaved({
        accounts: payload.accounts ?? null,
        message: matchingAccount
          ? `Updated ${ownerName} · ${matchingAccount.accountDisplayName} to ${formatSnapshotDate(preview.snapshotDate)}.`
          : `Added ${ownerName} · ${label}.`,
        tone: "success",
        accountId: savedAccountId,
      });
    } catch {
      setError("Could not save this export right now.");
    } finally {
      setIsSaving(false);
    }
  }

  const title = targetAccount
    ? `Update ${targetAccount.accountDisplayName}`
    : "Add an export";

  return (
    <Modal
      title={title}
      description={
        targetAccount
          ? `${targetAccount.ownerDisplayName ?? "Unassigned"} · ${targetAccount.sourceName ?? "Investment account"}`
          : "Excellence or bank portfolio export. We match it to the right account."
      }
      open={open}
      onClose={onClose}
      placement="sheet"
    >
      <label className={`file-dropzone${isReading ? " is-reading" : ""}`} aria-busy={isReading}>
        <input
          className="file-input"
          type="file"
          accept=".xlsx"
          aria-label="Investment export"
          disabled={isSaving}
          onChange={(event) => {
            const nextFile = event.target.files?.[0];
            if (nextFile) {
              void readFile(nextFile);
            }
          }}
        />
        <span className="file-dropzone-copy">
          <strong>{file?.name ?? "Choose the latest export"}</strong>
          <span aria-live="polite">
            {isReading
              ? "Reading the file…"
              : file
                ? "Choose another file to replace it."
                : "Excel file from Excellence or your bank. Or drop it here."}
          </span>
        </span>
      </label>

      {error ? <p className="status error" role="alert">{error}</p> : null}

      {preview ? (
        <div className="investment-update-review">
          <section className="investment-update-headline">
            <span className="eyebrow">
              {matchingAccount ? "Update" : "New account"} · {INVESTMENT_PROVIDER_SOURCE_NAME[preview.provider]}
            </span>
            <h3>
              {ownerName} · {accountLabel.trim() || "Unnamed account"}
            </h3>
            <p className="muted-text">
              {matchingAccount
                ? `${formatSnapshotDate(matchingAccount.snapshotDate)} → ${formatSnapshotDate(preview.snapshotDate)}`
                : `Data from ${formatSnapshotDate(preview.snapshotDate)}`}
            </p>
          </section>

          <dl className="investment-update-figures">
            <div>
              <dt>Value</dt>
              <dd>{formatMoneyWithCurrency(newTotal, workspaceCurrency)}</dd>
            </div>
            {matchingAccount ? (
              <div>
                <dt>Change</dt>
                <dd className={changeTone(newTotal - matchingAccount.totalMarketValue)}>
                  {formatSignedMoney(newTotal - matchingAccount.totalMarketValue, workspaceCurrency)}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Positions</dt>
              <dd>{preview.holdings.length}</dd>
            </div>
          </dl>

          {addedPositions.length > 0 || removedPositions.length > 0 ? (
            <ul className="investment-update-changes">
              {addedPositions.length > 0 ? (
                <li>
                  <strong>New:</strong> {describePositions(addedPositions)}
                </li>
              ) : null}
              {removedPositions.length > 0 ? (
                <li>
                  <strong>No longer held:</strong> {describePositions(removedPositions)}
                </li>
              ) : null}
            </ul>
          ) : matchingAccount ? (
            <p className="helper-text">Same positions as the current snapshot.</p>
          ) : null}

          {pointsElsewhere ? (
            <p className="status warning">
              This file is for {accountLabel.trim() || "a different account"}, not{" "}
              {targetAccount?.accountDisplayName}. Saving will{" "}
              {matchingAccount ? `update ${matchingAccount.accountDisplayName}` : "add a new account"}.
            </p>
          ) : null}
          {isOlderThanShown ? (
            <p className="status warning">
              This export is older than the {formatSnapshotDate(matchingAccount?.snapshotDate ?? null)} data
              already shown. It will be kept, but the account keeps showing the newer data.
            </p>
          ) : null}
          {isSameDate ? (
            <p className="helper-text">Replaces the export already saved for this date.</p>
          ) : null}
          {!canSaveToWorkspace ? (
            <p className="status warning">
              This workspace uses {workspaceCurrency}. Saving investments is limited to ILS workspaces for now.
            </p>
          ) : null}
          {preview.warnings.map((warning) => (
            <p key={warning} className="status warning">{warning}</p>
          ))}

          <details
            className="disclosure"
            open={showDetails}
            onToggle={(event) => setShowDetails(event.currentTarget.open)}
          >
            <summary>Owner and account</summary>
            <div className="stack compact">
              <label className="field">
                <span>Owner</span>
                <select
                  className="input"
                  value={ownerMemberId}
                  onChange={(event) => setOwnerMemberId(event.target.value)}
                  disabled={isSaving}
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                      {member.isActive ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Account label</span>
                <input
                  className="input"
                  value={accountLabel}
                  onChange={(event) => setAccountLabel(event.target.value)}
                  placeholder="134-607974"
                  disabled={isSaving}
                />
                {!preview.accountLabel ? (
                  <span className="field-hint">
                    This file has no account number. Use the same label next time so it updates this account.
                  </span>
                ) : null}
              </label>
            </div>
          </details>

          {preview.holdings.length > 0 ? (
            <details className="disclosure">
              <summary>Positions in this file ({preview.holdings.length})</summary>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th className="numeric-cell">Value</th>
                      <th className="numeric-cell">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.holdings.map((holding, index) => (
                      <tr key={`${holdingKey(holding.assetName, holding.securityId)}-${index}`}>
                        <td>
                          <strong>{holding.assetName}</strong>
                          {holding.securityId ? <div className="table-note">{holding.securityId}</div> : null}
                        </td>
                        <td className="numeric-cell">
                          {holding.marketValueIls === null
                            ? "-"
                            : formatMoneyWithCurrency(holding.marketValueIls, workspaceCurrency)}
                        </td>
                        <td className="numeric-cell">{formatPercent(holding.portfolioWeightPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}

          {preview.activities.length > 0 ? (
            <p className="helper-text">
              Also includes {preview.activities.length} activity{" "}
              {preview.activities.length === 1 ? "row" : "rows"}, saved with this export.
            </p>
          ) : null}

          <div className="investment-update-actions">
            <button className="button button-secondary" type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button
              className="button"
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave}
              aria-busy={isSaving}
            >
              {isSaving ? "Saving…" : matchingAccount ? "Update account" : "Add account"}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
