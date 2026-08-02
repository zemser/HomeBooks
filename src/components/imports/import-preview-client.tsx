"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { getCurrencyNormalizationDisplayState } from "@/features/currency/display";

type PreviewTransaction = {
  transactionDate: string;
  bookingDate?: string;
  merchantRaw: string;
  category?: string;
  originalAmount: number;
  originalCurrency: string;
  settlementAmount?: number;
  settlementCurrency?: string;
  normalizedAmount: number;
  workspaceCurrency: string;
  statementSection?: string;
  normalizationRateSource: string;
  direction: "debit" | "credit";
};

type PreviewResponse = {
  detectedTemplate: {
    id: string;
    confidence: number;
    reason: string;
  };
  accountLabel?: string;
  statementLabel?: string;
  transactionCount: number;
  previewTransactions: PreviewTransaction[];
  warnings: string[];
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
  reviewPendingCount: number;
  earliestTransactionDate: string | null;
  latestTransactionDate: string | null;
};

type ImportPreviewClientProps = {
  savedImports?: SavedImportSummary[];
  workspaceCurrency: string;
};

type SaveState = "idle" | "saving" | "saved" | "duplicate" | "error";

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

export function ImportPreviewClient({
  savedImports = [],
  workspaceCurrency: initialWorkspaceCurrency,
}: ImportPreviewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [workspaceCurrency, setWorkspaceCurrency] = useState(initialWorkspaceCurrency);
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedImportList, setSavedImportList] = useState(savedImports);
  const [lastSavedImportId, setLastSavedImportId] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>("No file selected yet");
  const [fileInputVersion, setFileInputVersion] = useState(0);

  useEffect(() => {
    setSavedImportList(savedImports);
  }, [savedImports]);

  useEffect(() => {
    setWorkspaceCurrency(initialWorkspaceCurrency);
  }, [initialWorkspaceCurrency]);

  useEffect(() => {
    setSelectedFileName("No file selected yet");
  }, [initialWorkspaceCurrency]);

  useEffect(() => {
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
  }, []);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setResult(null);
    setPendingSave(null);
    setSaveState("idle");

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

    setResult(preview);
  }

  async function handleSaveImport() {
    if (!pendingSave) {
      return;
    }

    setError(null);
    setSaveState("saving");

    const formData = new FormData();
    formData.append("file", pendingSave.file);
    formData.append("workspaceCurrency", pendingSave.workspaceCurrency);
    formData.append("importType", "bank");
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
        message?: string;
        error?: string;
        import?: SavedImportSummary | null;
      };
      const savedImport = data.import ?? null;

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
    setSelectedFileName("No file selected yet");
    setFileInputVersion((current) => current + 1);
  }

  const totalPendingReviewCount = savedImportList.reduce(
    (sum, item) => sum + item.reviewPendingCount,
    0,
  );
  const highlightedImport =
    savedImportList.find((item) => item.id === lastSavedImportId) ?? savedImportList[0] ?? null;
  const hasSavedOutcome = saveState === "saved" || saveState === "duplicate";
  const savedTransactionCount = highlightedImport?.transactionCount ?? result?.transactionCount ?? 0;
  const savedReviewPendingCount = highlightedImport?.reviewPendingCount ?? 0;
  const savedOutcomeTitle = saveState === "duplicate" ? "Already imported" : "Import saved";
  const savedOutcomeCopy =
    saveState === "duplicate"
      ? "This file is already in the workspace."
      : `${savedTransactionCount} transaction${savedTransactionCount === 1 ? "" : "s"} saved.`;
  const savedOutcomeNextStep =
    savedReviewPendingCount > 0
      ? `${savedReviewPendingCount} need review before reports are complete.`
      : "Nothing from this import is waiting in the review queue.";

  return (
    <section className="stack">
      <article className="card">
        <h2>Import bank statement</h2>
        <p>
          Upload a CSV or Excel statement. You will preview the rows before saving.
        </p>

        <form
          className="stack"
          action={(formData) => startTransition(() => void handleSubmit(formData))}
        >
          <input type="hidden" name="workspaceCurrency" value={workspaceCurrency} />

          <label className="field">
            <span>Statement file</span>
            <div className="file-dropzone">
              <input
                key={fileInputVersion}
                className="file-input"
                type="file"
                name="file"
                accept=".xlsx,.csv"
                required
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setSelectedFileName(file ? file.name : "No file selected yet");

                  if (file && event.currentTarget.form) {
                    const formData = new FormData(event.currentTarget.form);
                    startTransition(() => void handleSubmit(formData));
                  }
                }}
              />
              <div className="file-dropzone-copy">
                <strong>Drop a CSV or Excel export here</strong>
                <p>Supports Max and Cal CSV or Excel exports.</p>
                <span className="file-dropzone-filename" aria-live="polite">
                  {selectedFileName}
                </span>
              </div>
              <span className="button button-secondary file-dropzone-button">Choose file</span>
            </div>
          </label>

          <p className="helper-text" aria-live="polite">
            {isPending
              ? "Previewing file..."
              : selectedFileName === "No file selected yet"
                ? "Choose a file to preview its transactions."
                : "Preview ready below. Review it before saving the import."}
          </p>
        </form>

        {error ? (
          <div className="import-feedback">
            <p className="status error">{error}</p>
          </div>
        ) : null}
      </article>

      {result ? (
        <section className="stack">
          <article className="card stack">
            <h2>Detected statement</h2>
            <div className="meta-grid">
              <div>
                <strong>Template</strong>
                <p>{formatTemplateName(result.detectedTemplate.id)}</p>
              </div>
              <div>
                <strong>Reason</strong>
                <p>{result.detectedTemplate.reason}</p>
              </div>
              <div>
                <strong>Account</strong>
                <p>{result.accountLabel ?? "Not detected"}</p>
              </div>
              <div>
                <strong>Statement</strong>
                <p>{result.statementLabel ?? "Not detected"}</p>
              </div>
              <div>
                <strong>Transactions found</strong>
                <p>{result.transactionCount}</p>
              </div>
            </div>

            {result.warnings.length > 0 ? (
              <div className="stack">
                {result.warnings.map((warning) => (
                  <p className="status warning" key={warning}>
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}

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
                      href="/imports/review"
                      onClick={() => router.refresh()}
                    >
                      {totalPendingReviewCount > 0
                        ? `Review transactions (${totalPendingReviewCount})`
                        : "Review transactions"}
                    </Link>
                    <Link className="button button-secondary" href="/expenses">
                      Open ledger
                    </Link>
                    <button
                      className="link-button"
                      type="button"
                      onClick={handleImportAnotherFile}
                    >
                      Import another file
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleSaveImport()}
                  disabled={saveState === "saving"}
                >
                  {saveState === "saving" ? "Saving..." : "Save transactions"}
                </button>
              )}
            </div>
          </article>

          <article className="card">
            <h2>Previewed transactions</h2>
            <p>Showing up to 50 transactions.</p>
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
                  {result.previewTransactions.map((transaction, index) => {
                    const currencyState = getCurrencyNormalizationDisplayState(transaction);

                    return (
                      <tr key={`${transaction.transactionDate}-${transaction.merchantRaw}-${index}`}>
                        <td>{transaction.transactionDate}</td>
                        <td>{transaction.merchantRaw}</td>
                        <td>{transaction.category ?? "-"}</td>
                        <td>
                          {transaction.direction === "credit" ? "-" : ""}
                          {transaction.originalAmount.toFixed(2)} {transaction.originalCurrency}
                        </td>
                        <td>
                          {transaction.settlementAmount
                            ? `${transaction.direction === "credit" ? "-" : ""}${transaction.settlementAmount.toFixed(2)} ${transaction.settlementCurrency ?? transaction.originalCurrency}`
                            : "-"}
                        </td>
                        <td>
                          <div className="stack compact">
                            <span>
                              {transaction.normalizedAmount.toFixed(2)} {transaction.workspaceCurrency}
                            </span>
                            {currencyState.label ? (
                              <>
                                <span
                                  className={`badge ${
                                    currencyState.tone === "warning"
                                      ? "badge-warning"
                                      : "badge-neutral"
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
          </article>
        </section>
      ) : null}

      {savedImportList.length > 0 ? (
        <article className="card">
          <div className="page-actions">
            <div>
              <h2>Saved bank statements</h2>
            </div>
            {totalPendingReviewCount > 0 ? (
              <span className="badge badge-warning">
                {totalPendingReviewCount} still need review
              </span>
            ) : (
              <span className="badge badge-neutral">Queue is clear</span>
            )}
          </div>

          <div className="table-wrap">
            <table className="data-table import-history-table">
              <caption className="sr-only">Saved bank statement imports</caption>
              <thead>
                <tr>
                  <th scope="col">Statement</th>
                  <th scope="col">Activity period</th>
                  <th scope="col">Rows</th>
                  <th scope="col">Review</th>
                  <th scope="col">Imported</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {savedImportList.map((savedImport) => (
                  <tr key={savedImport.id}>
                    <td>
                      <strong>{savedImport.originalFilename}</strong>
                      <div className="table-note">
                        {savedImport.sourceName ?? "Unknown source"} · {formatTemplateName(savedImport.templateName)}
                      </div>
                      <span className={`badge ${savedImport.importStatus === "completed" ? "badge-neutral" : "badge-warning"}`}>
                        {savedImport.importStatus}
                      </span>
                    </td>
                    <td>{formatImportActivityRange(savedImport)}</td>
                    <td>
                      <strong>{savedImport.transactionCount}</strong>
                      <div className="table-note">{savedImport.reviewedTransactionCount} reviewed</div>
                    </td>
                    <td>
                      <strong>{savedImport.reviewPendingCount}</strong>
                      <div className="table-note">{savedImport.reviewPendingCount === 0 ? "Complete" : "Still need review"}</div>
                    </td>
                    <td>{formatSavedAt(savedImport.createdAt)}</td>
                    <td>
                      <div className="import-history-actions">
                        <Link
                          className="link-button"
                          href={`/imports/review?import=${encodeURIComponent(savedImport.id)}`}
                          onClick={() => router.refresh()}
                        >
                          {savedImport.reviewPendingCount > 0 ? "Review" : "Open queue"}
                        </Link>
                        <Link className="link-button" href="/expenses">Ledger</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );
}
