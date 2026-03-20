"use client";

import { useState, useTransition } from "react";

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

const workspaceCurrencies = ["ILS", "USD", "EUR"];

export function ImportPreviewClient() {
  const [isPending, startTransition] = useTransition();
  const [workspaceCurrency, setWorkspaceCurrency] = useState("ILS");
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setResult(null);

    const response = await fetch("/api/imports/preview", {
      method: "POST",
      body: formData,
    });

    const data = (await response.json()) as PreviewResponse | { error?: string };

    if (!response.ok) {
      setError("error" in data && data.error ? data.error : "Preview failed.");
      return;
    }

    setResult(data as PreviewResponse);
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
              onChange={(event) => setWorkspaceCurrency(event.target.value)}
            >
              {workspaceCurrencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
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
    </section>
  );
}

