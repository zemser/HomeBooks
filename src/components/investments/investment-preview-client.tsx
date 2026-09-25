"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { InvestmentHoldingsBoard } from "@/components/investments/investment-holdings-board";
import { INVESTMENT_PROVIDER_SOURCE_NAME } from "@/features/investments/constants";
import type {
  InvestmentAccountHoldingsSnapshot,
  InvestmentActivityType,
  InvestmentImportSummary,
  InvestmentProviderId,
} from "@/features/investments/types";
import { normalizeInvestmentAccountLabel } from "@/features/investments/utils";
import type { WorkspaceMemberSettingsItem } from "@/features/workspaces/types";

type InvestmentPreviewHolding = {
  assetName: string;
  securityId: string | null;
  lastPrice: string | number | null;
  quantity: string | number | null;
  marketValueIls: string | number | null;
  marketValueNative: string | number | null;
  dailyChangePct: string | number | null;
  dailyChangeNative: string | number | null;
  costBasisPrice: string | number | null;
  gainLossPct: string | number | null;
  gainLossNative: string | number | null;
  gainLossIls: string | number | null;
  portfolioWeightPct: string | number | null;
  loanedQuantity: string | number | null;
  aiRecommendation: string | null;
  aiScore: string | number | null;
  personalNote: string | null;
};

type InvestmentPreviewActivity = {
  activityDate: string | null;
  activityType: InvestmentActivityType;
  activityTypeLabel: string;
  providerActionLabel: string;
  assetName: string;
  assetSymbol: string | null;
  quantity: string | number | null;
  unitPrice: string | number | null;
  totalAmount: string | number | null;
  currency: string | null;
  normalizedAmount: string | number | null;
  notes: string | null;
};

type InvestmentPreviewResponse = {
  provider: string;
  accountLabel: string | null;
  snapshotDate: string | null;
  snapshotTimestampText: string | null;
  activityPeriodStart: string | null;
  activityPeriodEnd: string | null;
  holdings: InvestmentPreviewHolding[];
  activities: InvestmentPreviewActivity[];
  warnings: string[];
};

type InvestmentSaveResponse = {
  status?: string;
  error?: string;
  accounts?: InvestmentAccountHoldingsSnapshot[];
  import?: InvestmentImportSummary | null;
  imports?: InvestmentImportSummary[];
};

type PendingSave = {
  file: File;
  preview: InvestmentPreviewResponse;
};

type SaveState = "idle" | "saving" | "saved" | "duplicate" | "error";

type InvestmentPreviewClientProps = {
  initialInvestmentAccountHoldings: InvestmentAccountHoldingsSnapshot[];
  initialInvestmentImports: InvestmentImportSummary[];
  initialMembers: WorkspaceMemberSettingsItem[];
  initialCurrentMemberId: string;
  workspaceCurrency: string;
  mode?: "all" | "upload" | "saved";
};

function formatDisplayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
}

function providerSourceName(provider: string) {
  if (
    provider === "excellence"
    || provider === "current-portfolio"
    || provider === "bank-securities"
  ) {
    return INVESTMENT_PROVIDER_SOURCE_NAME[provider satisfies InvestmentProviderId];
  }

  return provider;
}

function findExistingInvestmentAccount(input: {
  accounts: InvestmentAccountHoldingsSnapshot[];
  ownerMemberId: string;
  accountLabel: string;
  provider: string;
}) {
  const label = input.accountLabel.trim();

  if (!label || !input.ownerMemberId.trim()) {
    return null;
  }

  let canonicalLabel: string;

  try {
    canonicalLabel = normalizeInvestmentAccountLabel(label);
  } catch {
    return null;
  }

  const sourceName = providerSourceName(input.provider);

  return (
    input.accounts.find((account) => {
      if (account.ownerMemberId !== input.ownerMemberId || account.sourceName !== sourceName) {
        return false;
      }

      try {
        return normalizeInvestmentAccountLabel(account.accountDisplayName) === canonicalLabel;
      } catch {
        return false;
      }
    }) ?? null
  );
}

function formatSnapshotValue(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function formatTimestampValue(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatActivityPeriodValue(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) {
    return "-";
  }

  if (startDate && endDate) {
    if (startDate === endDate) {
      return formatSnapshotValue(startDate);
    }

    return `${formatSnapshotValue(startDate)} -> ${formatSnapshotValue(endDate)}`;
  }

  return formatSnapshotValue(startDate ?? endDate);
}

function getImportStatusLabel(item: InvestmentImportSummary) {
  if (
    item.importStatus === "completed"
    && item.holdingCount === 0
    && item.activityCount === 0
  ) {
    return "superseded";
  }

  return item.importStatus;
}

function getPreviewSaveLabel(preview: InvestmentPreviewResponse | null, saveState: SaveState) {
  if (saveState === "saving") {
    return "Saving...";
  }

  if (saveState === "saved") {
    return "Saved";
  }

  if (!preview) {
    return "Save import";
  }

  if (preview.holdings.length > 0 && preview.activities.length > 0) {
    return "Save import";
  }

  if (preview.activities.length > 0) {
    return "Save activity import";
  }

  return "Save snapshot";
}

export function InvestmentPreviewClient({
  initialInvestmentAccountHoldings,
  initialInvestmentImports,
  initialMembers,
  initialCurrentMemberId,
  workspaceCurrency,
  mode = "all",
}: InvestmentPreviewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uploadFormVersion, setUploadFormVersion] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvestmentPreviewResponse | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [members] = useState<WorkspaceMemberSettingsItem[]>(initialMembers);
  const [selectedOwnerMemberId, setSelectedOwnerMemberId] = useState(initialCurrentMemberId);
  const [accountLabelDraft, setAccountLabelDraft] = useState("");
  const [investmentAccountHoldings, setInvestmentAccountHoldings] =
    useState<InvestmentAccountHoldingsSnapshot[]>(initialInvestmentAccountHoldings);
  const [investmentImports, setInvestmentImports] =
    useState<InvestmentImportSummary[]>(initialInvestmentImports);

  useEffect(() => {
    setInvestmentAccountHoldings(initialInvestmentAccountHoldings);
  }, [initialInvestmentAccountHoldings]);

  useEffect(() => {
    setInvestmentImports(initialInvestmentImports);
  }, [initialInvestmentImports]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const matchingAccount = preview
    ? findExistingInvestmentAccount({
        accounts: investmentAccountHoldings,
        ownerMemberId: selectedOwnerMemberId,
        accountLabel: accountLabelDraft,
        provider: preview.provider,
      })
    : null;
  const matchingOwnerName =
    members.find((member) => member.id === selectedOwnerMemberId)?.displayName ?? "this member";

  const canSaveToWorkspace = workspaceCurrency === "ILS";
  const canSubmitSave = Boolean(
    pendingSave
      && selectedOwnerMemberId.trim()
      && accountLabelDraft.trim()
      && canSaveToWorkspace,
  );

  function resetPreviewFlow() {
    setPreview(null);
    setPendingSave(null);
    setFileName(null);
    setSelectedOwnerMemberId(initialCurrentMemberId);
    setAccountLabelDraft("");
    setUploadFormVersion((current) => current + 1);
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    setMessage(null);
    setSaveState("idle");
    setPreview(null);
    setPendingSave(null);

    const file = formData.get("file");
    if (file instanceof File) {
      setFileName(file.name);
    } else {
      setFileName(null);
    }

    try {
      const response = await fetch("/api/investments/preview", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as
        | InvestmentPreviewResponse
        | { error?: string };

      if (!response.ok) {
        setError(payload && "error" in payload ? payload.error ?? "Preview failed." : "Preview failed.");
        return;
      }

      const nextPreview = payload as InvestmentPreviewResponse;
      setPreview(nextPreview);
      setSelectedOwnerMemberId(initialCurrentMemberId);
      setAccountLabelDraft(nextPreview.accountLabel ?? "");

      if (file instanceof File) {
        setPendingSave({
          file,
          preview: nextPreview,
        });
      }
    } catch {
      setError("Could not load the investment preview right now.");
    }
  }

  async function handleSave() {
    if (!pendingSave) {
      return;
    }

    setError(null);
    setMessage(null);
    setSaveState("saving");
    const accountLabel = accountLabelDraft.trim();
    const updatingAccount = findExistingInvestmentAccount({
      accounts: investmentAccountHoldings,
      ownerMemberId: selectedOwnerMemberId,
      accountLabel,
      provider: pendingSave.preview.provider,
    });

    const formData = new FormData();
    formData.append("file", pendingSave.file);
    formData.append("ownerMemberId", selectedOwnerMemberId);
    formData.append("accountLabel", accountLabel);

    try {
      const response = await fetch("/api/investments", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as InvestmentSaveResponse;

      if (!response.ok) {
        if (response.status === 409 || payload.status === "duplicate") {
          setSaveState("duplicate");
          if (payload.accounts) {
            setInvestmentAccountHoldings(payload.accounts);
          }
          if (payload.imports) {
            setInvestmentImports(payload.imports);
          }
          resetPreviewFlow();
          setMessage("This file is already saved, so the account is already up to date.");
          router.refresh();
          return;
        }

        setSaveState("error");
        setError(payload.error ?? "Could not save this investment snapshot.");
        return;
      }

      setSaveState("saved");
      if (payload.accounts) {
        setInvestmentAccountHoldings(payload.accounts);
      }
      if (payload.imports) {
        setInvestmentImports(payload.imports);
      } else if (payload.import) {
        setInvestmentImports((current) => [
          payload.import as InvestmentImportSummary,
          ...current.filter((item) => item.id !== payload.import?.id),
        ]);
      }
      resetPreviewFlow();
      setMessage(
        updatingAccount
          ? `Updated ${updatingAccount.ownerDisplayName ?? matchingOwnerName} · ${updatingAccount.accountDisplayName}. The table shows the latest snapshot.`
          : `Saved ${accountLabel}. The table shows the latest snapshot.`,
      );
      router.refresh();
    } catch {
      setSaveState("error");
      setError("Could not save this investment snapshot right now.");
    }
  }

  return (
    <section className="stack">
      {mode !== "upload" ? (
        <InvestmentHoldingsBoard
          accounts={investmentAccountHoldings}
          members={members}
          workspaceCurrency={workspaceCurrency}
        />
      ) : null}

      {mode !== "saved" ? <article className="card stack compact">
        <div className="page-actions">
          <div>
            <h2>Upload an export</h2>
            <p className="muted-text">
              Upload an Excellence or bank portfolio file. Choose who the account belongs
              to. Uploading a newer export for the same account updates it.
            </p>
          </div>
          <span className="badge badge-neutral">Excel only</span>
        </div>

        <form
          key={uploadFormVersion}
          className="stack compact"
          action={(formData) => startTransition(() => void handleSubmit(formData))}
        >
          <label className="field">
            <span>Investment workbook</span>
            <input className="input" type="file" name="file" accept=".xlsx" required />
          </label>

          <div className="action-row">
            <button className="button" type="submit" disabled={isPending}>
              {isPending ? "Parsing..." : "Preview investment file"}
            </button>
            {fileName ? <span className="helper-text">{fileName}</span> : null}
          </div>
        </form>

        {!canSaveToWorkspace ? (
          <p className="status warning">
            This workspace uses {workspaceCurrency}. Saving investment snapshots is
            limited to ILS workspaces in v1, so preview still works but save is blocked.
          </p>
        ) : null}

        {error ? <p className="status error">{error}</p> : null}
        {message ? (
          <p className={saveState === "duplicate" ? "status warning" : "status"}>
            {message}
          </p>
        ) : null}
      </article> : null}

      {mode !== "saved" && preview ? (
        <>
          <article className="card">
            <div className="summary-strip">
              <div>
                <strong>{providerSourceName(preview.provider)}</strong>
                <span>Provider</span>
              </div>
              <div>
                <strong>{preview.accountLabel ?? "-"}</strong>
                <span>Detected account</span>
              </div>
              <div>
                <strong>{formatSnapshotValue(preview.snapshotDate)}</strong>
                <span>Data date</span>
              </div>
              <div>
                <strong>
                  {formatActivityPeriodValue(
                    preview.activityPeriodStart,
                    preview.activityPeriodEnd,
                  )}
                </strong>
                <span>Activity period</span>
              </div>
              <div>
                <strong>{preview.holdings.length}</strong>
                <span>Holdings</span>
              </div>
              <div>
                <strong>{preview.activities.length}</strong>
                <span>Activities</span>
              </div>
            </div>
          </article>

          <article className="card stack compact">
            <div>
              <h2>{matchingAccount ? "Update this account" : "Confirm ownership"}</h2>
              <p className="muted-text">
                {matchingAccount
                  ? `This file matches ${matchingOwnerName} · ${matchingAccount.accountDisplayName}. Saving replaces the snapshot the table shows.`
                  : "Choose who this account belongs to. The same account label on a later export updates that account."}
              </p>
            </div>

            <div className="inline-form">
              <label className="field">
                <span>Owner</span>
                <select
                  className="input"
                  value={selectedOwnerMemberId}
                  onChange={(event) => setSelectedOwnerMemberId(event.target.value)}
                  disabled={saveState === "saving"}
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
                  value={accountLabelDraft}
                  onChange={(event) => setAccountLabelDraft(event.target.value)}
                  placeholder="חשבון: 134-607974"
                  disabled={saveState === "saving"}
                />
              </label>
            </div>

            {!preview.accountLabel ? (
              <p className="status warning">
                This workbook did not expose an account label, so type the exact label
                you want to use before saving.
              </p>
            ) : null}

            <div className="action-row">
              <button
                className="button"
                type="button"
                onClick={() => void handleSave()}
                disabled={!canSubmitSave || saveState === "saving"}
              >
                {saveState === "saving"
                  ? "Saving..."
                  : saveState === "saved"
                    ? "Saved"
                    : matchingAccount
                      ? `Update ${matchingOwnerName} · ${matchingAccount.accountDisplayName}`
                      : getPreviewSaveLabel(preview, saveState)}
              </button>
              {!selectedOwnerMemberId.trim() ? (
                <span className="helper-text">Choose an owner before saving.</span>
              ) : null}
              {!accountLabelDraft.trim() ? (
                <span className="helper-text">Confirm the account label before saving.</span>
              ) : null}
            </div>
          </article>

          {preview.snapshotTimestampText ? (
            <article className="card">
              <p className="helper-text">
                Snapshot timestamp: <strong>{preview.snapshotTimestampText}</strong>
              </p>
            </article>
          ) : null}

          {preview.warnings.length > 0 ? (
            <article className="card stack compact">
              <h2>Warnings</h2>
              <ul>
                {preview.warnings.map((warning) => (
                  <li key={warning} className="status warning">
                    {warning}
                  </li>
                ))}
              </ul>
            </article>
          ) : null}

          <article className="card stack compact">
            <div>
              <h2>Holdings</h2>
              <p className="muted-text">
                These parsed rows will be persisted as a saved snapshot if you confirm
                the owner and account label.
              </p>
            </div>

            {preview.holdings.length === 0 ? (
              <p className="empty-state">No holdings were parsed from this workbook.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Security ID</th>
                      <th>Last price</th>
                      <th>Quantity</th>
                      <th>Market value</th>
                      <th>Daily change</th>
                      <th>Cost basis</th>
                      <th>Gain/Loss</th>
                      <th>Portfolio</th>
                      <th>Loaned</th>
                      <th>AI</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.holdings.map((holding) => (
                      <tr key={`${holding.assetName}-${holding.securityId ?? "unknown"}`}>
                        <td>
                          <strong>{holding.assetName}</strong>
                        </td>
                        <td>{holding.securityId ?? "-"}</td>
                        <td>{formatDisplayValue(holding.lastPrice)}</td>
                        <td>{formatDisplayValue(holding.quantity)}</td>
                        <td>
                          {formatDisplayValue(holding.marketValueIls)}
                          <div className="table-note">
                            Native: {formatDisplayValue(holding.marketValueNative)}
                          </div>
                        </td>
                        <td>
                          {formatDisplayValue(holding.dailyChangePct)}%
                          <div className="table-note">
                            {formatDisplayValue(holding.dailyChangeNative)}
                          </div>
                        </td>
                        <td>{formatDisplayValue(holding.costBasisPrice)}</td>
                        <td>
                          {formatDisplayValue(holding.gainLossPct)}%
                          <div className="table-note">
                            Native: {formatDisplayValue(holding.gainLossNative)}
                          </div>
                        </td>
                        <td>{formatDisplayValue(holding.portfolioWeightPct)}%</td>
                        <td>{formatDisplayValue(holding.loanedQuantity)}</td>
                        <td>
                          <div>{holding.aiRecommendation ?? "-"}</div>
                          <div className="table-note">Score: {formatDisplayValue(holding.aiScore)}</div>
                        </td>
                        <td>{holding.personalNote ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="card stack compact">
            <div>
              <h2>Activities</h2>
              <p className="muted-text">
                These parsed rows will be persisted beside the saved holdings snapshots
                if you confirm the owner and account label.
              </p>
            </div>

            {preview.activities.length === 0 ? (
              <p className="empty-state">No activity rows were found in this workbook.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Source action</th>
                      <th>Asset</th>
                      <th>Symbol</th>
                      <th>Quantity</th>
                      <th>Unit price</th>
                      <th>Total</th>
                      <th>Normalized</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.activities.map((activity, index) => (
                      <tr
                        key={`${activity.activityDate}-${activity.assetName}-${activity.providerActionLabel}-${activity.totalAmount ?? "na"}-${index}`}
                      >
                        <td>{formatSnapshotValue(activity.activityDate)}</td>
                        <td>{activity.activityTypeLabel}</td>
                        <td>{activity.providerActionLabel}</td>
                        <td>{activity.assetName}</td>
                        <td>{activity.assetSymbol ?? "-"}</td>
                        <td>{formatDisplayValue(activity.quantity)}</td>
                        <td>{formatDisplayValue(activity.unitPrice)}</td>
                        <td>
                          {formatDisplayValue(activity.totalAmount)}
                          <div className="table-note">{activity.currency ?? "-"}</div>
                        </td>
                        <td>
                          {activity.normalizedAmount === null
                            || activity.normalizedAmount === undefined
                            ? "-"
                            : `${formatDisplayValue(activity.normalizedAmount)} ILS`}
                        </td>
                        <td>{activity.notes ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </>
      ) : null}

      {mode !== "upload" && investmentImports.length > 0 ? <article className="card stack compact">
        <div>
          <h2>Investment import history</h2>
          <p className="muted-text">
            This view stays local to the investments sidecar so investment snapshot and
            activity imports do not appear as zero-transaction rows in the bank import
            screen.
          </p>
        </div>

        <div className="stack">
            {investmentImports.map((item) => (
              <div className="card" key={item.id}>
                <div className="meta-grid">
                  <div>
                    <strong>File</strong>
                    <p>{item.originalFilename}</p>
                  </div>
                  <div>
                    <strong>Status</strong>
                    <p>{getImportStatusLabel(item)}</p>
                  </div>
                  <div>
                    <strong>Snapshot date</strong>
                    <p>{formatSnapshotValue(item.snapshotDate)}</p>
                  </div>
                  <div>
                    <strong>Activity period</strong>
                    <p>
                      {formatActivityPeriodValue(
                        item.activityPeriodStart,
                        item.activityPeriodEnd,
                      )}
                    </p>
                  </div>
                  <div>
                    <strong>Active holdings</strong>
                    <p>{item.holdingCount}</p>
                  </div>
                  <div>
                    <strong>Activity rows</strong>
                    <p>{item.activityCount}</p>
                  </div>
                  <div>
                    <strong>Source</strong>
                    <p>{item.sourceName ?? "-"}</p>
                  </div>
                  <div>
                    <strong>Saved</strong>
                    <p>{formatTimestampValue(item.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
      </article> : null}
    </section>
  );
}
