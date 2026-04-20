"use client";

import { useState, useTransition } from "react";

import { getInvestmentAssetTypeLabel } from "@/features/investments/classification";
import { buildInvestmentPortfolioReport } from "@/features/investments/reporting";
import type {
  InvestmentAccountHoldingsSnapshot,
  InvestmentActivityType,
  InvestmentImportSummary,
  PersistedInvestmentActivity,
} from "@/features/investments/types";
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
  activities?: PersistedInvestmentActivity[];
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
  initialInvestmentActivities: PersistedInvestmentActivity[];
  initialInvestmentImports: InvestmentImportSummary[];
  initialMembers: WorkspaceMemberSettingsItem[];
  initialCurrentMemberId: string;
  workspaceCurrency: string;
};

function formatDisplayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
}

function formatNumberValue(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
) {
  if (value === null || value === undefined) {
    return "-";
  }

  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
}

function formatMoneyValue(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined) {
    return "-";
  }

  return `${formatNumberValue(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function formatSignedMoneyValue(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined) {
    return "-";
  }

  const formatted = new Intl.NumberFormat("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(value);

  return `${formatted} ${currency}`;
}

function formatPercentValue(
  value: number | null | undefined,
  options?: {
    signed?: boolean;
    maximumFractionDigits?: number;
    minimumFractionDigits?: number;
  },
) {
  if (value === null || value === undefined) {
    return "-";
  }

  const formatted = new Intl.NumberFormat("en", {
    minimumFractionDigits: options?.minimumFractionDigits ?? 1,
    maximumFractionDigits: options?.maximumFractionDigits ?? 1,
    signDisplay: options?.signed ? "exceptZero" : "auto",
  }).format(value);

  return `${formatted}%`;
}

function getProgressWidth(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "0%";
  }

  return `${Math.max(0, Math.min(100, value))}%`;
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
  initialInvestmentActivities,
  initialInvestmentImports,
  initialMembers,
  initialCurrentMemberId,
  workspaceCurrency,
}: InvestmentPreviewClientProps) {
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
  const [investmentActivities, setInvestmentActivities] =
    useState<PersistedInvestmentActivity[]>(initialInvestmentActivities);
  const [investmentImports, setInvestmentImports] =
    useState<InvestmentImportSummary[]>(initialInvestmentImports);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const portfolioReport = buildInvestmentPortfolioReport(investmentAccountHoldings);
  const leadingAssetMix = portfolioReport.assetMix[0] ?? null;
  const leadingOwner = portfolioReport.ownerOverviews[0] ?? null;

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

    const formData = new FormData();
    formData.append("file", pendingSave.file);
    formData.append("ownerMemberId", selectedOwnerMemberId);
    formData.append("accountLabel", accountLabelDraft.trim());

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
          if (payload.activities) {
            setInvestmentActivities(payload.activities);
          }
          if (payload.imports) {
            setInvestmentImports(payload.imports);
          }
          resetPreviewFlow();
          setMessage("This workbook was already saved for the current workspace.");
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
      if (payload.activities) {
        setInvestmentActivities(payload.activities);
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
        pendingSave.preview.activities.length > 0 && pendingSave.preview.holdings.length === 0
          ? "Investment activity import saved to the workspace. Preview another file when you are ready."
          : "Investment import saved to the workspace. Preview another file when you are ready.",
      );
    } catch {
      setSaveState("error");
      setError("Could not save this investment snapshot right now.");
    }
  }

  return (
    <section className="stack">
      {investmentAccountHoldings.length > 0 ? (
        <>
          <article className="card stack compact">
            <div>
              <h2>Portfolio summary</h2>
              <p className="muted-text">
                Based on the latest active snapshot for each saved investment account.
              </p>
            </div>

            <div className="summary-strip">
              <div>
                <strong>
                  {formatMoneyValue(portfolioReport.summary.totalMarketValue, workspaceCurrency)}
                </strong>
                <span>Total market value</span>
              </div>
              <div>
                <strong>
                  {formatSignedMoneyValue(portfolioReport.summary.totalGainLoss, workspaceCurrency)}
                </strong>
                <span>Unrealized gain/loss</span>
              </div>
              <div>
                <strong>{portfolioReport.summary.accountCount}</strong>
                <span>Investment accounts</span>
              </div>
              <div>
                <strong>{portfolioReport.summary.holdingCount}</strong>
                <span>Active holdings</span>
              </div>
            </div>

            <div className="meta-grid">
              <div>
                <strong>Largest account</strong>
                <p>{portfolioReport.summary.largestAccount?.accountDisplayName ?? "-"}</p>
                {portfolioReport.summary.largestAccount ? (
                  <p className="helper-text">
                    {formatMoneyValue(
                      portfolioReport.summary.largestAccount.totalMarketValue,
                      workspaceCurrency,
                    )}{" "}
                    ·{" "}
                    {formatPercentValue(
                      portfolioReport.summary.largestAccount.portfolioSharePct,
                    )}{" "}
                    of portfolio
                  </p>
                ) : null}
              </div>
              <div>
                <strong>Top holding</strong>
                <p>{portfolioReport.summary.topHolding?.assetName ?? "-"}</p>
                {portfolioReport.summary.topHolding ? (
                  <p className="helper-text">
                    {formatMoneyValue(
                      portfolioReport.summary.topHolding.marketValue,
                      workspaceCurrency,
                    )}{" "}
                    · {portfolioReport.summary.topHolding.accountDisplayName} ·{" "}
                    {formatPercentValue(
                      portfolioReport.summary.topHolding.portfolioWeightPct,
                    )}{" "}
                    of portfolio
                  </p>
                ) : null}
              </div>
              <div>
                <strong>Snapshot coverage</strong>
                <p>
                  {portfolioReport.summary.oldestSnapshotDate
                    && portfolioReport.summary.latestSnapshotDate ? (
                      portfolioReport.summary.oldestSnapshotDate
                      === portfolioReport.summary.latestSnapshotDate ? (
                        formatSnapshotValue(portfolioReport.summary.latestSnapshotDate)
                      ) : (
                        `${formatSnapshotValue(
                          portfolioReport.summary.oldestSnapshotDate,
                        )} -> ${formatSnapshotValue(portfolioReport.summary.latestSnapshotDate)}`
                      )
                    ) : (
                      "-"
                    )}
                </p>
                <p className="helper-text">
                  Each account contributes its latest active snapshot, so dates can vary.
                </p>
              </div>
              <div>
                <strong>Cost basis coverage</strong>
                <p>
                  {portfolioReport.summary.holdingsWithCostBasisCount} of{" "}
                  {portfolioReport.summary.holdingCount} holdings include cost basis
                </p>
                <p className="helper-text">
                  {portfolioReport.summary.totalCostBasis !== null ? (
                    <>
                      Known basis{" "}
                      {formatMoneyValue(
                        portfolioReport.summary.totalCostBasis,
                        workspaceCurrency,
                      )}{" "}
                      ·{" "}
                      {formatPercentValue(portfolioReport.summary.totalGainLossPct, {
                        signed: true,
                      })}{" "}
                      gain/loss vs known basis
                    </>
                  ) : (
                    "Percent gain/loss becomes available once a saved snapshot includes cost basis."
                  )}
                </p>
              </div>
              <div>
                <strong>Composition signal</strong>
                <p>{leadingAssetMix?.assetTypeLabel ?? "-"}</p>
                <p className="helper-text">
                  {leadingAssetMix ? (
                    <>
                      {formatPercentValue(leadingAssetMix.portfolioSharePct)} of portfolio
                      across {leadingAssetMix.holdingCount} holdings
                    </>
                  ) : (
                    "No saved holdings are available yet."
                  )}
                </p>
              </div>
              <div>
                <strong>Asset type coverage</strong>
                <p>
                  {portfolioReport.summary.estimatedAssetTypeCount} of{" "}
                  {portfolioReport.summary.holdingCount} holdings are estimated
                </p>
                <p className="helper-text">
                  Excellence snapshots do not expose a dedicated asset-type column, so
                  the current mix uses holding-name heuristics when needed.
                </p>
              </div>
            </div>
          </article>

          <article className="card stack compact">
            <div className="page-actions">
              <div>
              <h2>Portfolio composition</h2>
              <p className="muted-text">
                  Estimated from the latest active holdings per account. Activity imports
                  now sit beside this view without changing the holdings composition until
                  a new snapshot is saved.
                </p>
              </div>
              <span className="badge badge-neutral">
                {portfolioReport.summary.estimatedAssetTypeCount > 0
                  ? "Name-based mix"
                  : "Saved asset mix"}
              </span>
            </div>

            <div className="summary-strip">
              <div>
                <strong>{leadingAssetMix?.assetTypeLabel ?? "-"}</strong>
                <span>Largest asset type</span>
              </div>
              <div>
                <strong>
                  {formatPercentValue(leadingAssetMix?.portfolioSharePct ?? null)}
                </strong>
                <span>Largest asset-type share</span>
              </div>
              <div>
                <strong>{portfolioReport.assetMix.length}</strong>
                <span>Asset types present</span>
              </div>
              <div>
                <strong>{portfolioReport.summary.estimatedAssetTypeCount}</strong>
                <span>Estimated classifications</span>
              </div>
            </div>

            <div className="composition-list">
              {portfolioReport.assetMix.map((mix) => (
                <article className="composition-row" key={mix.assetType}>
                  <div className="composition-row-header">
                    <div>
                      <h3>{mix.assetTypeLabel}</h3>
                      <p className="muted-text">
                        {mix.holdingCount} holdings across {mix.accountCount} accounts
                      </p>
                    </div>
                    <div className="composition-row-meta">
                      <strong>
                        {formatMoneyValue(mix.totalMarketValue, workspaceCurrency)}
                      </strong>
                      <span>{formatPercentValue(mix.portfolioSharePct)} of portfolio</span>
                    </div>
                  </div>

                  <div className="progress-meter" aria-hidden="true">
                    <span
                      className="progress-meter-fill"
                      style={{ width: getProgressWidth(mix.portfolioSharePct) }}
                    />
                  </div>

                  {mix.estimatedHoldingCount > 0 ? (
                    <p className="helper-text">
                      {mix.estimatedHoldingCount} holdings in this group were classified
                      from the holding name because the source workbook does not provide a
                      dedicated asset-type field yet.
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </article>

          <article className="card stack compact">
            <div>
              <h2>Owner split</h2>
              <p className="muted-text">
                Household-level view of who currently holds what across the saved
                investment accounts.
              </p>
            </div>

            <div className="summary-strip">
              <div>
                <strong>{portfolioReport.ownerOverviews.length}</strong>
                <span>Owners represented</span>
              </div>
              <div>
                <strong>{leadingOwner?.ownerDisplayName ?? "-"}</strong>
                <span>Largest owner bucket</span>
              </div>
              <div>
                <strong>
                  {formatPercentValue(leadingOwner?.portfolioSharePct ?? null)}
                </strong>
                <span>Largest owner share</span>
              </div>
              <div>
                <strong>
                  {leadingOwner?.dominantAssetTypeLabel ?? "-"}
                </strong>
                <span>Largest owner&apos;s top asset type</span>
              </div>
            </div>

            <div className="composition-list">
              {portfolioReport.ownerOverviews.map((ownerOverview) => (
                <article className="composition-row" key={ownerOverview.ownerKey}>
                  <div className="composition-row-header">
                    <div>
                      <h3>{ownerOverview.ownerDisplayName}</h3>
                      <p className="muted-text">
                        {ownerOverview.accountCount} accounts · {ownerOverview.holdingCount}{" "}
                        holdings
                      </p>
                    </div>
                    <div className="composition-row-meta">
                      <strong>
                        {formatMoneyValue(
                          ownerOverview.totalMarketValue,
                          workspaceCurrency,
                        )}
                      </strong>
                      <span>
                        {formatPercentValue(ownerOverview.portfolioSharePct)} of portfolio
                      </span>
                    </div>
                  </div>

                  <div className="progress-meter" aria-hidden="true">
                    <span
                      className="progress-meter-fill"
                      style={{ width: getProgressWidth(ownerOverview.portfolioSharePct) }}
                    />
                  </div>

                  <p className="helper-text">
                    {ownerOverview.dominantAssetTypeLabel ? (
                      <>
                        Dominant asset type: {ownerOverview.dominantAssetTypeLabel} at{" "}
                        {formatPercentValue(ownerOverview.dominantAssetTypeSharePct)} of
                        this owner&apos;s saved holdings.
                      </>
                    ) : (
                      "No dominant asset type is available yet."
                    )}{" "}
                    Latest snapshot: {formatSnapshotValue(ownerOverview.latestSnapshotDate)}.
                  </p>
                </article>
              ))}
            </div>
          </article>

          <article className="card stack compact">
            <div>
              <h2>Top positions across accounts</h2>
              <p className="muted-text">
                Combined across the latest saved snapshot for each account, so repeated
                holdings roll into one portfolio-level position.
              </p>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Symbol</th>
                    <th>Type</th>
                    <th>Accounts</th>
                    <th>Market value</th>
                    <th>Portfolio share</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolioReport.topPositions.slice(0, 8).map((position) => (
                    <tr key={position.positionKey}>
                      <td>
                        <strong>{position.assetName}</strong>
                      </td>
                      <td>{position.assetSymbol ?? "-"}</td>
                      <td>{position.assetTypeLabel}</td>
                      <td>{position.accountCount}</td>
                      <td>
                        {formatMoneyValue(position.totalMarketValue, workspaceCurrency)}
                      </td>
                      <td>{formatPercentValue(position.portfolioSharePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="card stack compact">
            <div>
              <h2>Account overview</h2>
              <p className="muted-text">
                Compare saved accounts before drilling into the full holdings tables.
              </p>
            </div>

            <div className="stack">
              {portfolioReport.accountOverviews.map((accountOverview) => (
                <article className="card stack compact" key={`${accountOverview.accountId}-overview`}>
                  <div className="page-actions">
                    <div>
                      <h3>{accountOverview.accountDisplayName}</h3>
                      <p className="muted-text">
                        {accountOverview.ownerDisplayName
                          ? `${accountOverview.ownerDisplayName} · `
                          : ""}
                        {accountOverview.sourceName ?? "Investment"}
                      </p>
                    </div>
                    <span
                      className={`badge ${
                        accountOverview.concentrationLevel === "watch"
                          ? "badge-warning"
                          : "badge-neutral"
                      }`}
                    >
                      {accountOverview.concentrationHint}
                    </span>
                  </div>

                  <div className="summary-strip">
                    <div>
                      <strong>
                        {formatMoneyValue(accountOverview.totalMarketValue, workspaceCurrency)}
                      </strong>
                      <span>Total market value</span>
                    </div>
                    <div>
                      <strong>
                        {formatSignedMoneyValue(accountOverview.totalGainLoss, workspaceCurrency)}
                      </strong>
                      <span>Unrealized gain/loss</span>
                    </div>
                    <div>
                      <strong>{accountOverview.holdingCount}</strong>
                      <span>Holdings</span>
                    </div>
                    <div>
                      <strong>{formatPercentValue(accountOverview.portfolioSharePct)}</strong>
                      <span>Portfolio share</span>
                    </div>
                  </div>

                  <div className="meta-grid">
                    <div>
                      <strong>Top holding</strong>
                      <p>{accountOverview.topHoldingName ?? "-"}</p>
                      <p className="helper-text">
                        {accountOverview.topHoldingName ? (
                          <>
                            {accountOverview.topHoldingSymbol
                              ? `${accountOverview.topHoldingSymbol} · `
                              : ""}
                            {formatMoneyValue(
                              accountOverview.topHoldingMarketValue,
                              workspaceCurrency,
                            )}{" "}
                            · {formatPercentValue(accountOverview.topHoldingWeightPct)} of
                            account
                          </>
                        ) : (
                          "No holding details are available for this snapshot."
                        )}
                      </p>
                    </div>
                    <div>
                      <strong>Concentration</strong>
                      <p>{accountOverview.concentrationHint}</p>
                      <p className="helper-text">
                        Top 3 holdings:{" "}
                        {formatPercentValue(accountOverview.topThreeHoldingsWeightPct)} of
                        account
                      </p>
                    </div>
                    <div>
                      <strong>Snapshot</strong>
                      <p>{formatSnapshotValue(accountOverview.snapshotDate)}</p>
                      <p className="helper-text">
                        Saved {formatTimestampValue(accountOverview.importCreatedAt)}
                      </p>
                    </div>
                    <div>
                      <strong>Cost basis coverage</strong>
                      <p>
                        {accountOverview.holdingsWithCostBasisCount} of{" "}
                        {accountOverview.holdingCount} holdings include cost basis
                      </p>
                      <p className="helper-text">
                        {accountOverview.totalCostBasis !== null ? (
                          <>
                            Known basis{" "}
                            {formatMoneyValue(
                              accountOverview.totalCostBasis,
                              workspaceCurrency,
                            )}{" "}
                            ·{" "}
                            {formatPercentValue(accountOverview.totalGainLossPct, {
                              signed: true,
                            })}{" "}
                            gain/loss vs known basis
                          </>
                        ) : (
                          "Percent gain/loss is unavailable until cost basis is present."
                        )}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </>
      ) : null}

      <article className="card stack compact">
        <div>
          <h2>Latest saved holdings</h2>
          <p className="muted-text">
            Active positions are grouped by investment account. Replaced imports stay
            visible in history below, but only the latest active snapshot per account is
            rendered here.
          </p>
        </div>

        {investmentAccountHoldings.length === 0 ? (
          <p className="empty-state">No investment holdings snapshots have been saved yet.</p>
        ) : (
          <div className="stack">
            {investmentAccountHoldings.map((account) => (
              <article className="card stack compact" key={account.accountId}>
                <div className="page-actions">
                  <div>
                    <h3>{account.accountDisplayName}</h3>
                    <p className="muted-text">
                      {account.ownerDisplayName ? `${account.ownerDisplayName} · ` : ""}
                      Latest active snapshot from {account.importOriginalFilename}
                    </p>
                  </div>
                  <span className="badge badge-neutral">{account.sourceName ?? "Investment"}</span>
                </div>

                <div className="summary-strip">
                  <div>
                    <strong>{formatSnapshotValue(account.snapshotDate)}</strong>
                    <span>Snapshot date</span>
                  </div>
                  <div>
                    <strong>{account.holdingCount}</strong>
                    <span>Holdings</span>
                  </div>
                  <div>
                    <strong>{formatMoneyValue(account.totalMarketValue, workspaceCurrency)}</strong>
                    <span>Total market value</span>
                  </div>
                  <div>
                    <strong>{formatMoneyValue(account.totalCostBasis, workspaceCurrency)}</strong>
                    <span>Total cost basis</span>
                  </div>
                  <div>
                    <strong>{formatSignedMoneyValue(account.totalGainLoss, workspaceCurrency)}</strong>
                    <span>Total gain/loss</span>
                  </div>
                  <div>
                    <strong>{formatTimestampValue(account.importCreatedAt)}</strong>
                    <span>Saved</span>
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Symbol</th>
                        <th>Type</th>
                        <th>Quantity</th>
                        <th>Market value</th>
                        <th>Cost basis</th>
                        <th>Gain/Loss</th>
                      </tr>
                    </thead>
                    <tbody>
                      {account.holdings.map((holding) => (
                        <tr
                          key={`${account.accountId}-${holding.assetName}-${holding.assetSymbol ?? "unknown"}`}
                        >
                        <td>
                          <strong>{holding.assetName}</strong>
                        </td>
                        <td>{holding.assetSymbol ?? "-"}</td>
                        <td>
                          {getInvestmentAssetTypeLabel(holding.assetType)}
                          {holding.assetTypeSource === "estimated" ? (
                            <div className="table-note">Estimated from holding name</div>
                          ) : null}
                        </td>
                        <td>{formatNumberValue(holding.quantity, { maximumFractionDigits: 8 })}</td>
                        <td>{formatMoneyValue(holding.marketValue, holding.marketValueCurrency)}</td>
                        <td>{formatMoneyValue(holding.costBasis, workspaceCurrency)}</td>
                        <td>{formatSignedMoneyValue(holding.gainLoss, workspaceCurrency)}</td>
                      </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        )}
      </article>

      <article className="card stack compact">
        <div>
          <h2>Recent saved activity rows</h2>
          <p className="muted-text">
            Activity imports are stored beside the holdings snapshots so you can inspect
            recent buys, dividends, transfers, and tax or fee rows without disturbing the
            saved composition view.
          </p>
        </div>

        {investmentActivities.length === 0 ? (
          <p className="empty-state">No investment activity rows have been saved yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Asset</th>
                  <th>Account</th>
                  <th>Quantity</th>
                  <th>Total</th>
                  <th>Normalized</th>
                  <th>Imported</th>
                </tr>
              </thead>
              <tbody>
                {investmentActivities.slice(0, 40).map((activity) => (
                  <tr key={activity.id}>
                    <td>{formatSnapshotValue(activity.activityDate)}</td>
                    <td>{activity.activityTypeLabel}</td>
                    <td>
                      <strong>{activity.assetName}</strong>
                      {activity.assetSymbol ? (
                        <div className="table-note">{activity.assetSymbol}</div>
                      ) : null}
                    </td>
                    <td>
                      <div>{activity.accountDisplayName}</div>
                      <div className="table-note">
                        {activity.ownerDisplayName ?? "Workspace owner"}
                      </div>
                    </td>
                    <td>{formatNumberValue(activity.quantity, { maximumFractionDigits: 8 })}</td>
                    <td>
                      {formatDisplayValue(activity.totalAmount)}
                      <div className="table-note">{activity.currency ?? "Currency unknown"}</div>
                    </td>
                    <td>{formatSignedMoneyValue(activity.normalizedAmount, workspaceCurrency)}</td>
                    <td>{formatTimestampValue(activity.importCreatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="card stack compact">
        <div className="page-actions">
          <div>
            <h2>Preview a workbook</h2>
            <p className="muted-text">
              Parse an Excellence workbook here when you want to inspect a new holdings
              snapshot or activity export before saving it into the household investment
              view.
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
      </article>

      {preview ? (
        <>
          <article className="card">
            <div className="summary-strip">
              <div>
                <strong>{preview.provider}</strong>
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
              <h2>Confirm ownership</h2>
              <p className="muted-text">
                Investment accounts are treated as confirmed workspace identities, so
                choose the owner and confirm the account label before saving this
                import into the workspace.
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
                {getPreviewSaveLabel(preview, saveState)}
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
      ) : (
        <article className="card">
          <p className="empty-state">
            Upload an investment workbook to see the parsed snapshot or activity preview here.
          </p>
        </article>
      )}

      <article className="card stack compact">
        <div>
          <h2>Investment import history</h2>
          <p className="muted-text">
            This view stays local to the investments sidecar so investment snapshot and
            activity imports do not appear as zero-transaction rows in the bank import
            screen.
          </p>
        </div>

        {investmentImports.length === 0 ? (
          <p className="empty-state">No investment imports have been saved yet.</p>
        ) : (
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
        )}
      </article>
    </section>
  );
}
