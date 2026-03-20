"use client";

import { useEffect, useState, useTransition } from "react";

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
  sourceName?: string | null;
  templateName?: string | null;
  transactionCount?: number | null;
};

type ImportPreviewClientProps = {
  savedImports?: SavedImportSummary[];
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

export function ImportPreviewClient({ savedImports = [] }: ImportPreviewClientProps) {
  const [isPending, startTransition] = useTransition();
  const [workspaceCurrency, setWorkspaceCurrency] = useState("ILS");
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedImportList, setSavedImportList] = useState(savedImports);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedImports() {
      try {
        const response = await fetch("/api/imports");

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          workspaceCurrency?: string;
          savedImports?: SavedImportSummary[];
        };

        if (cancelled) {
          return;
        }

        if (data.workspaceCurrency) {
          setWorkspaceCurrency(data.workspaceCurrency);
        }

        if (data.savedImports) {
          setSavedImportList(data.savedImports);
        }
      } catch {
        // Keep the page usable even when persistence isn't configured yet.
      }
    }

    void loadSavedImports();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSavedImportList(savedImports);
  }, [savedImports]);

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
      setError("error" in data && data.error ? data.error : "Preview failed.");
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

      if (!response.ok) {
        if (response.status === 404 || response.status === 405) {
          setSaveState("error");
          setError("Saving is not connected yet. The preview works, but the persisted import endpoint is not available.");
          return;
        }

        if (response.status === 409 || data.duplicate || data.status === "duplicate") {
          setSaveState("duplicate");
          return;
        }

        setSaveState("error");
        setError(data.error ?? data.message ?? "Save import failed.");
        return;
      }

      if (data.duplicate || data.status === "duplicate") {
        setSaveState("duplicate");
        return;
      }

      const savedImport = data.import;

      if (savedImport) {
        setSavedImportList((current) => [savedImport, ...current.filter((item) => item.id !== savedImport.id)]);
      }

      setSaveState("saved");
    } catch {
      setSaveState("error");
      setError("Could not save this import right now.");
    }
  }

  return (
    <section className="stack">
      <article className="card">
        <h2>Preview a bank import</h2>
        <p>
          Upload one Excel or CSV file and the app will detect the statement format,
          parse it, and show normalized transaction rows before anything is saved.
        </p>

        <form
          className="stack"
          action={(formData) => startTransition(() => void handleSubmit(formData))}
        >
          <label className="field">
            <span>Workspace currency</span>
            <select
              className="input"
              name="workspaceCurrency"
              value={workspaceCurrency}
              disabled
              aria-disabled="true"
            >
              <option value={workspaceCurrency}>{workspaceCurrency}</option>
            </select>
          </label>

          <label className="field">
            <span>Statement file</span>
            <input className="input" type="file" name="file" accept=".xlsx,.csv" required />
          </label>

          <button className="button" type="submit" disabled={isPending}>
            {isPending ? "Parsing..." : "Preview import"}
          </button>
        </form>

        {error ? <p className="status error">{error}</p> : null}
      </article>

      {result ? (
        <section className="stack">
          <article className="card">
            <h2>Detected statement</h2>
            <div className="meta-grid">
              <div>
                <strong>Template</strong>
                <p>{result.detectedTemplate.id}</p>
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
                <strong>Rows parsed</strong>
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
              <button
                className="button"
                type="button"
                onClick={() => void handleSaveImport()}
                disabled={saveState === "saving" || saveState === "saved"}
              >
                {saveState === "saving"
                  ? "Saving..."
                  : saveState === "saved"
                    ? "Saved"
                    : "Save import"}
              </button>
              {saveState === "saved" ? (
                <p className="status">Import saved to the workspace.</p>
              ) : null}
              {saveState === "duplicate" ? (
                <p className="status warning">
                  This file already exists for the current workspace, so we skipped a duplicate save.
                </p>
              ) : null}
            </div>
          </article>

          <article className="card">
            <h2>Normalized preview</h2>
            <p>Showing up to 50 parsed rows.</p>
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
                  {result.previewTransactions.map((transaction, index) => (
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
                        {transaction.normalizedAmount.toFixed(2)} {transaction.workspaceCurrency}
                      </td>
                      <td>{transaction.statementSection ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {savedImportList.length > 0 ? (
        <article className="card">
          <h2>Saved imports</h2>
          <p>Recent imports already persisted for the current workspace.</p>
          <div className="stack">
            {savedImportList.map((savedImport) => (
              <div className="card" key={savedImport.id}>
                <div className="meta-grid">
                  <div>
                    <strong>File</strong>
                    <p>{savedImport.originalFilename}</p>
                  </div>
                  <div>
                    <strong>Status</strong>
                    <p>{savedImport.importStatus}</p>
                  </div>
                  <div>
                    <strong>Saved</strong>
                    <p>{formatSavedAt(savedImport.createdAt)}</p>
                  </div>
                  <div>
                    <strong>Template</strong>
                    <p>{savedImport.templateName ?? "-"}</p>
                  </div>
                  <div>
                    <strong>Source</strong>
                    <p>{savedImport.sourceName ?? "-"}</p>
                  </div>
                  <div>
                    <strong>Rows</strong>
                    <p>{savedImport.transactionCount ?? "-"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
