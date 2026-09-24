"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { getCurrencyNormalizationDisplayState } from "@/features/currency/display";
import { buildHistoryMonthHref } from "@/features/expenses/history-query";
import { formatMoneyDisplay } from "@/features/expenses/presentation";

type PreviewTransaction = {
  transactionDate: string;
  bookingDate?: string;
  merchantRaw: string;
  category?: string;
  originalAmount: number;
  originalCurrency: string | null;
  settlementAmount?: number;
  settlementCurrency?: string;
  normalizedAmount: number;
  workspaceCurrency: string;
  statementSection?: string;
  normalizationRateSource: string;
  direction: "debit" | "credit";
};

type PreviewResponse = {
  accountOwnerMemberId: string | null;
  members: Array<{ id: string; displayName: string }>;
  automaticRuleCountWithOwner: number;
  automaticRuleCountWithoutOwner: number;
  detectedTemplate: {
    id: string;
    confidence: number;
    reason: string;
  };
  accountLabel?: string;
  statementLabel?: string;
  transactionCount: number;
  newTransactionCount: number;
  duplicateTransactionCount: number;
  automaticRuleCount: number;
  previewTransactions: PreviewTransaction[];
  warnings: string[];
  existingImport?: {
    id: string;
    originalFilename: string;
    createdAt: string;
  } | null;
};

type SavedImportSummary = {
  id: string;
  originalFilename: string;
  importStatus: string;
  createdAt: string;
  completedAt: string | null;
  sourceName?: string | null;
  templateName?: string | null;
  transactionCount: number;
  reviewedTransactionCount: number;
  manuallyReviewedCount: number;
  ruleAppliedCount: number;
  reviewPendingCount: number;
  earliestTransactionDate: string | null;
  latestTransactionDate: string | null;
  accountId?: string | null;
  accountLabel?: string | null;
  accountOwnerMemberId?: string | null;
  accountOwnerName?: string | null;
};

type ImportPreviewClientProps = {
  savedImports?: SavedImportSummary[];
  workspaceCurrency: string;
  currentMemberId?: string;
  mode?: "all" | "upload" | "history";
};

type StatementOwnerFilter = "all" | "mine" | string;

type SaveState = "idle" | "saving" | "saved" | "duplicate" | "error";

type SaveOutcome = {
  transactionCount: number;
  duplicateTransactionCount: number;
  automaticRuleCount: number;
  updatedCount: number;
};

type PendingSave = {
  file: File;
  workspaceCurrency: string;
  preview: PreviewResponse;
};

function formatSavedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatImportActivityRange(item: SavedImportSummary) {
  if (!item.earliestTransactionDate || !item.latestTransactionDate) {
    return "No transaction dates recorded yet";
  }

  const earliest = item.earliestTransactionDate.slice(0, 7);
  const latest = item.latestTransactionDate.slice(0, 7);

  if (earliest === latest) {
    return new Intl.DateTimeFormat("en", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${earliest}-01T00:00:00.000Z`));
  }

  return `${earliest} to ${latest}`;
}

function historyRowsHref(input: {
  latestTransactionDate?: string | null;
  reviewStatus?: "automatic";
}) {
  return buildHistoryMonthHref({
    month: input.latestTransactionDate,
    reviewStatus: input.reviewStatus,
  });
}

function formatTemplateName(value: string | null | undefined) {
  switch (value) {
    case "max_credit_statement":
      return "Max credit-card statement";
    case "cal_card_export":
      return "Cal card export";
    case "cal_recent_transactions_report":
      return "Cal recent transactions report";
    default:
      return value ?? "Unknown template";
  }
}

const EMPTY_SAVED_IMPORTS: SavedImportSummary[] = [];
const PREVIEW_ROW_LIMIT = 5;

function ownerKey(item: SavedImportSummary) {
  return item.accountOwnerMemberId ?? "joint";
}

function ownerLabel(item: SavedImportSummary) {
  if (!item.accountOwnerMemberId) return "Joint";
  return item.accountOwnerName?.trim() || "Account owner";
}

function PreviewRows({ rows }: { rows: PreviewTransaction[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Merchant</th>
            <th>Category</th>
            <th>Original</th>
            <th>Settlement</th>
            <th>Normalized</th>
            <th>Section</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((transaction, index) => {
            const currencyState = getCurrencyNormalizationDisplayState(transaction);

            return (
              <tr key={`${transaction.transactionDate}-${transaction.merchantRaw}-${index}`}>
                <td>{transaction.transactionDate}</td>
                <td>{transaction.merchantRaw}</td>
                <td>{transaction.category ?? "-"}</td>
                <td>
                  {formatMoneyDisplay(
                    transaction.originalAmount,
                    transaction.originalCurrency,
                    transaction.direction,
                  )}
                </td>
                <td>
                  {transaction.settlementAmount
                    ? formatMoneyDisplay(
                        transaction.settlementAmount,
                        transaction.settlementCurrency ?? transaction.originalCurrency,
                        transaction.direction,
                      )
                    : "-"}
                </td>
                <td>
                  <div className="stack compact">
                    <span>
                      {formatMoneyDisplay(
                        transaction.normalizedAmount,
                        transaction.workspaceCurrency,
                      )}
                    </span>
                    {currencyState.label ? (
                      <>
                        <span
                          className={`badge ${
                            currencyState.tone === "warning" ? "badge-warning" : "badge-neutral"
                          }`}
                        >
                          {currencyState.label}
                        </span>
                        {currencyState.shortDescription ? (
                          <div className="table-note">{currencyState.shortDescription}</div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </td>
                <td>{transaction.statementSection ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ImportPreviewClient({
  savedImports = EMPTY_SAVED_IMPORTS,
  workspaceCurrency: initialWorkspaceCurrency,
  currentMemberId,
  mode = "all",
}: ImportPreviewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [workspaceCurrency, setWorkspaceCurrency] = useState(initialWorkspaceCurrency);
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [accountOwner, setAccountOwner] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveOutcome, setSaveOutcome] = useState<SaveOutcome | null>(null);
  const [savedImportList, setSavedImportList] = useState(savedImports);
  const [lastSavedImportId, setLastSavedImportId] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [fileInputVersion, setFileInputVersion] = useState(0);
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<StatementOwnerFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  useEffect(() => {
    setSavedImportList(savedImports);
  }, [savedImports]);

  useEffect(() => {
    setWorkspaceCurrency(initialWorkspaceCurrency);
  }, [initialWorkspaceCurrency]);

  useEffect(() => {
    setSelectedFileName(null);
  }, [initialWorkspaceCurrency]);

  useEffect(() => {
    if (mode === "upload") return;

    let isMounted = true;

    async function refreshSavedImports() {
      try {
        const response = await fetch("/api/imports", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          savedImports?: SavedImportSummary[];
          workspaceCurrency?: string;
        };

        if (!isMounted) return;
        if (data.savedImports) setSavedImportList(data.savedImports);
        if (data.workspaceCurrency) setWorkspaceCurrency(data.workspaceCurrency);
      } catch {
        // The server-rendered list remains usable if a background refresh fails.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void refreshSavedImports();
    }

    window.addEventListener("pageshow", refreshSavedImports);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      isMounted = false;
      window.removeEventListener("pageshow", refreshSavedImports);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [mode]);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setResult(null);
    setPendingSave(null);
    setSaveState("idle");
    setSaveOutcome(null);

    const workspaceCurrencyValue = formData.get("workspaceCurrency");
    const selectedWorkspaceCurrency =
      typeof workspaceCurrencyValue === "string" ? workspaceCurrencyValue : workspaceCurrency;

    const response = await fetch("/api/imports/preview", {
      method: "POST",
      body: formData,
    });

    const data = (await response.json()) as PreviewResponse | { error?: string };

    if (!response.ok) {
      setError("Could not preview this file right now. Please try again.");
      return;
    }

    const preview = data as PreviewResponse;
    const file = formData.get("file");

    if (file instanceof File) {
      setPendingSave({
        file,
        workspaceCurrency: selectedWorkspaceCurrency,
        preview,
      });
    }

    setAccountOwner(preview.accountOwnerMemberId ?? "");
    setResult(preview);
  }

  async function handleSaveImport() {
    if (!pendingSave || !accountOwner) {
      return;
    }

    setError(null);
    setSaveState("saving");

    const formData = new FormData();
    formData.append("file", pendingSave.file);
    formData.append("workspaceCurrency", pendingSave.workspaceCurrency);
    formData.append("importType", "bank");
    formData.append("accountOwnerMemberId", accountOwner);
    formData.append(
      "preview",
      JSON.stringify({
        detectedTemplate: pendingSave.preview.detectedTemplate,
        accountLabel: pendingSave.preview.accountLabel,
        statementLabel: pendingSave.preview.statementLabel,
        transactionCount: pendingSave.preview.transactionCount,
      }),
    );

    try {
      const response = await fetch("/api/imports", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json().catch(() => ({}))) as {
        status?: string;
        duplicate?: boolean;
        transactionCount?: number;
        duplicateTransactionCount?: number;
        automaticRuleCount?: number;
        updatedCount?: number;
        message?: string;
        error?: string;
        import?: SavedImportSummary | null;
      };
      const savedImport = data.import ?? null;

      setSaveOutcome({
        transactionCount: data.transactionCount ?? 0,
        duplicateTransactionCount: data.duplicateTransactionCount ?? 0,
        automaticRuleCount: data.automaticRuleCount ?? 0,
        updatedCount: data.updatedCount ?? 0,
      });

      if (savedImport) {
        setSavedImportList((current) => [
          savedImport,
          ...current.filter((item) => item.id !== savedImport.id),
        ]);
        setLastSavedImportId(savedImport.id);
      }

      if (!response.ok) {
        if (response.status === 404 || response.status === 405) {
          setSaveState("error");
        setError(
            "Saving is not connected yet. The preview works, but the persisted import endpoint is not available.",
          );
          return;
        }

        if (response.status === 409 || data.duplicate || data.status === "duplicate") {
          setSaveState("duplicate");
          return;
        }

        setSaveState("error");
        setError("Could not save this import right now. Please try again.");
        return;
      }

      if (data.duplicate || data.status === "duplicate") {
        setSaveState("duplicate");
        return;
      }

      setSaveState("saved");
      router.refresh();
    } catch {
      setSaveState("error");
      setError("Could not save this import right now. Please try again.");
    }
  }

  function handleImportAnotherFile() {
    setError(null);
    setResult(null);
    setPendingSave(null);
    setSaveState("idle");
    setSaveOutcome(null);
    setSelectedFileName(null);
    setFileInputVersion((current) => current + 1);
  }

  const totalPendingReviewCount = savedImportList.reduce(
    (sum, item) => sum + item.reviewPendingCount,
    0,
  );
  const highlightedImport =
    savedImportList.find((item) => item.id === lastSavedImportId) ?? savedImportList[0] ?? null;
  const hasSavedOutcome = saveState === "saved" || saveState === "duplicate";
  const savedTransactionCount = saveOutcome?.transactionCount ?? highlightedImport?.transactionCount ?? 0;
  const savedReviewPendingCount = highlightedImport?.reviewPendingCount ?? 0;
  const savedUpdatedCount = saveOutcome?.updatedCount ?? 0;
  const savedOutcomeTitle = saveState === "duplicate" ? "Already imported" : "Import saved";
  const savedOutcomeCopy =
    saveState === "duplicate"
      ? "This file is already in the workspace."
      : `${savedTransactionCount} new transaction${savedTransactionCount === 1 ? "" : "s"} imported.`;
  const savedOutcomeNextStep =
    saveState === "duplicate"
      ? "Nothing new was added."
      : savedUpdatedCount > 0
      ? `Updated ${savedUpdatedCount} older foreign charges with monthly rates.`
      : savedReviewPendingCount > 0
        ? `${savedReviewPendingCount} need review before reports are complete.`
        : "Nothing from this import is waiting in the review queue.";
  const ownerChoices = (() => {
    const byId = new Map<string, string>();
    for (const item of savedImportList) {
      const id = ownerKey(item);
      if (!byId.has(id)) byId.set(id, ownerLabel(item));
    }
    return [...byId.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((left, right) => {
        if (currentMemberId && left.id === currentMemberId) return -1;
        if (currentMemberId && right.id === currentMemberId) return 1;
        return left.label.localeCompare(right.label);
      });
  })();
  const sourceChoices = [
    ...new Set(
      savedImportList
        .map((item) => item.sourceName?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const statementFiltersActive = needsReviewOnly || ownerFilter !== "all" || Boolean(sourceFilter);
  const visibleImports = savedImportList
    .filter((item) => {
      if (needsReviewOnly && item.reviewPendingCount === 0) return false;
      if (ownerFilter === "mine" && item.accountOwnerMemberId !== currentMemberId) return false;
      if (ownerFilter !== "all" && ownerFilter !== "mine" && ownerKey(item) !== ownerFilter) return false;
      if (sourceFilter && item.sourceName !== sourceFilter) return false;
      return true;
    })
    .sort((left, right) => Number(right.reviewPendingCount > 0) - Number(left.reviewPendingCount > 0));

  function clearStatementFilters() {
    setNeedsReviewOnly(false);
    setOwnerFilter("all");
    setSourceFilter(null);
  }

  const emptyStatementCopy = needsReviewOnly && ownerFilter === "mine"
    ? "You have no statements waiting for review."
    : needsReviewOnly
      ? "Nothing is waiting for review."
      : ownerFilter === "mine"
        ? "No statements for your accounts yet."
        : ownerFilter !== "all"
          ? "No statements match this person."
          : sourceFilter
            ? `No ${sourceFilter} statements match.`
            : "No statements match.";

  return (
    <section className="stack">
      {mode !== "history" ? (
        <>
      <article className="card">
        <h2>Import bank statement</h2>

        <form
          className="stack"
          action={(formData) => startTransition(() => void handleSubmit(formData))}
        >
          <input type="hidden" name="workspaceCurrency" value={workspaceCurrency} />

          <label className={`file-dropzone${isPending ? " is-reading" : ""}`} aria-busy={isPending}>
            <input
              key={fileInputVersion}
              className="file-input"
              type="file"
              name="file"
              accept=".xlsx,.csv"
              required
              aria-label="Statement file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setSelectedFileName(file ? file.name : null);

                if (file && event.currentTarget.form) {
                  const formData = new FormData(event.currentTarget.form);
                  startTransition(() => void handleSubmit(formData));
                }
              }}
            />
            <span className="file-dropzone-copy">
              <strong>{selectedFileName ?? "Choose a statement"}</strong>
              <span aria-live="polite">
                {isPending
                  ? "Reading the file…"
                  : result?.existingImport || result?.newTransactionCount === 0
                    ? "This file is already imported."
                    : selectedFileName
                      ? "Review the rows below before saving."
                      : "Max or Cal, CSV or Excel. Or drop a file here."}
              </span>
            </span>
          </label>
        </form>

        {error ? (
          <div className="import-feedback">
            <p className="status error" role="alert">{error}</p>
          </div>
        ) : null}
      </article>

      {result ? (
        <section className="stack">
          <article className="card stack">
            <h2>Detected statement</h2>
            <div className="meta-grid">
              <div>
                <strong>Bank</strong>
                <p>{formatTemplateName(result.detectedTemplate.id)}</p>
              </div>
              <div>
                <strong>Account</strong>
                <p>{result.accountLabel ?? "Not detected"}</p>
              </div>
              <div>
                <strong>Period</strong>
                <p>{result.statementLabel ?? "Not detected"}</p>
              </div>
            </div>

            {!hasSavedOutcome && !result.existingImport && result.newTransactionCount > 0 ? (
              <label className="field">
                <span>This account belongs to</span>
                <select className="input" aria-label="This account belongs to" value={accountOwner} onChange={(event) => setAccountOwner(event.target.value)} disabled={saveState === "saving"}>
                  <option value="">Choose account owner</option>
                  {result.members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
                  <option value="joint">Joint or unknown — review people individually</option>
                </select>
                <span className="helper-text">Saved rules use this owner for who paid, personal spending, and income.</span>
              </label>
            ) : null}

            {result.existingImport || result.newTransactionCount === 0 ? (
              <section className="import-check" aria-labelledby="import-blocked-title">
                <div>
                  <span className="eyebrow">Already imported</span>
                  <h3 id="import-blocked-title">This file is already in the workspace</h3>
                </div>
                <p className="status warning" role="status">
                  {result.existingImport
                    ? `Saved ${formatSavedAt(result.existingImport.createdAt)} as ${result.existingImport.originalFilename}. Nothing new was added.`
                    : `All ${result.transactionCount} transactions in this file are already saved, so there is nothing new to import.`}
                </p>
                <div className="action-row">
                  {result.existingImport ? (
                    <Link
                      className="button"
                      href={`/transactions/review?import=${encodeURIComponent(result.existingImport.id)}`}
                      onClick={() => router.refresh()}
                    >
                      Open the saved statement
                    </Link>
                  ) : null}
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={handleImportAnotherFile}
                  >
                    Choose a different file
                  </button>
                </div>
              </section>
            ) : (
            <section className="import-check" aria-labelledby="import-check-title">
              <div>
                <span className="eyebrow">Import check</span>
                <h3 id="import-check-title">Here’s what will happen</h3>
              </div>
              <div className="import-check-grid">
                <div>
                  <strong>{result.newTransactionCount}</strong>
                  <span>New transactions</span>
                </div>
                <div>
                  <strong>{result.duplicateTransactionCount}</strong>
                  <span>Already imported · skipped</span>
                </div>
                <div>
                  <strong>{accountOwner && accountOwner !== "joint" ? result.automaticRuleCountWithOwner : result.automaticRuleCountWithoutOwner}</strong>
                  <span>Handled by saved rules</span>
                </div>
                <div>
                  <strong>{Math.max(result.newTransactionCount - (accountOwner && accountOwner !== "joint" ? result.automaticRuleCountWithOwner : result.automaticRuleCountWithoutOwner), 0)}</strong>
                  <span>Will need review</span>
                </div>
              </div>
              <p className="helper-text">
                Existing transactions will not be added again. Saved rules apply only to new exact merchant matches.
              </p>
            </section>
            )}

            {result.warnings.length > 0 && !result.existingImport && result.newTransactionCount > 0 ? (
              <div className="stack">
                {result.warnings.map((warning) => (
                  <p className="status warning" key={warning}>
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}

            {result.existingImport || result.newTransactionCount === 0 ? null : (
            <div className="stack">
              {hasSavedOutcome ? (
                <div className="home-focus-card">
                  <span
                    className={`badge ${saveState === "duplicate" ? "badge-warning" : "badge-neutral"}`}
                  >
                    {savedOutcomeTitle}
                  </span>
                  <h3>{savedOutcomeCopy}</h3>
                  <p>{savedOutcomeNextStep}</p>
                  <div className="action-row">
                    <Link
                      className="button"
                      href={`/transactions/review?import=${encodeURIComponent(highlightedImport?.id ?? lastSavedImportId ?? "")}`}
                      onClick={() => router.refresh()}
                    >
                      {saveState === "duplicate"
                        ? "Open the saved statement"
                        : savedReviewPendingCount > 0
                          ? `Review this statement · ${savedReviewPendingCount}`
                          : "Open this statement"}
                    </Link>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={handleImportAnotherFile}
                    >
                      {saveState === "duplicate" ? "Choose a different file" : "Upload another statement"}
                    </button>
                    {saveState === "duplicate" ? null : (
                      <Link
                        className="link-button"
                        href={historyRowsHref({
                          latestTransactionDate: highlightedImport?.latestTransactionDate,
                        })}
                      >
                        Open this statement in History
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleSaveImport()}
                  disabled={saveState === "saving" || !accountOwner}
                  aria-busy={saveState === "saving"}
                >
                  {saveState === "saving"
                    ? "Importing…"
                    : !accountOwner
                      ? "Choose who this account belongs to"
                      : `Import ${result.newTransactionCount} new transaction${result.newTransactionCount === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
            )}
            <PreviewRows rows={result.previewTransactions.slice(0, PREVIEW_ROW_LIMIT)} />
            {result.previewTransactions.length > PREVIEW_ROW_LIMIT ? (
              <details className="disclosure import-preview-disclosure">
                <summary>
                  Show the other {result.previewTransactions.length - PREVIEW_ROW_LIMIT} rows
                </summary>
                <PreviewRows rows={result.previewTransactions.slice(PREVIEW_ROW_LIMIT)} />
              </details>
            ) : null}
          </article>
        </section>
      ) : null}
        </>
      ) : null}

      {mode !== "upload" && savedImportList.length > 0 ? (
        <article className="card stack">
          <h2>Saved bank statements</h2>
          <div className="statement-filters" role="group" aria-label="Filter saved statements">
            <button
              className="statement-filter"
              type="button"
              aria-pressed={!statementFiltersActive}
              onClick={clearStatementFilters}
            >
              All
            </button>
            <button
              className="statement-filter"
              type="button"
              aria-pressed={needsReviewOnly}
              onClick={() => setNeedsReviewOnly((current) => !current)}
            >
              Needs review{totalPendingReviewCount > 0 ? ` · ${totalPendingReviewCount}` : ""}
            </button>
            {ownerChoices.length > 1 && currentMemberId ? (
              <button
                className="statement-filter"
                type="button"
                aria-pressed={ownerFilter === "mine"}
                onClick={() => setOwnerFilter((current) => current === "mine" ? "all" : "mine")}
              >
                Mine
              </button>
            ) : null}
            {ownerChoices.length > 1
              ? ownerChoices
                  .filter((choice) => choice.id !== currentMemberId)
                  .map((choice) => (
                    <button
                      className="statement-filter"
                      type="button"
                      aria-pressed={ownerFilter === choice.id}
                      key={choice.id}
                      onClick={() => setOwnerFilter((current) => current === choice.id ? "all" : choice.id)}
                    >
                      {choice.label}
                    </button>
                  ))
              : null}
            {sourceChoices.length > 1
              ? sourceChoices.map((source) => (
                  <button
                    className="statement-filter"
                    type="button"
                    aria-pressed={sourceFilter === source}
                    key={source}
                    onClick={() => setSourceFilter((current) => current === source ? null : source)}
                  >
                    {source}
                  </button>
                ))
              : null}
          </div>

          {visibleImports.length === 0 ? (
            <p className="empty-state">{emptyStatementCopy}</p>
          ) : (
            <ul className="import-statement-list">
              {visibleImports.map((savedImport) => (
                <li className="import-statement-row" key={savedImport.id}>
                  <div className="import-statement-main">
                    <div className="import-statement-title">
                      <span className="badge badge-source">{savedImport.sourceName?.trim() || "Statement"}</span>
                      <Link href={historyRowsHref({ latestTransactionDate: savedImport.latestTransactionDate })}>
                        {formatImportActivityRange(savedImport)}
                      </Link>
                      <span>{ownerLabel(savedImport)}</span>
                    </div>
                    <p className="table-note">{savedImport.originalFilename}</p>
                    <p className="import-statement-progress">
                      {savedImport.reviewPendingCount > 0 ? (
                        <strong>{savedImport.reviewPendingCount} need review</strong>
                      ) : (
                        <span>Complete</span>
                      )}
                      <span className="table-note">
                        {savedImport.transactionCount} transaction{savedImport.transactionCount === 1 ? "" : "s"}
                      </span>
                    </p>
                  </div>
                  {savedImport.reviewPendingCount > 0 ? (
                    <Link
                      className="button"
                      href={`/transactions/review?import=${encodeURIComponent(savedImport.id)}`}
                      onClick={() => router.refresh()}
                    >
                      Review
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </article>
      ) : null}
    </section>
  );
}
