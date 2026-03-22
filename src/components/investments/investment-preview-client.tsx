"use client";

import { useState, useTransition } from "react";

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
  activityDate: string;
  activityType: string;
  assetName: string;
  quantity: string | number | null;
  totalAmount: string | number | null;
  currency: string | null;
};

type InvestmentPreviewResponse = {
  provider: string;
  accountLabel: string | null;
  snapshotDate: string | null;
  snapshotTimestampText: string | null;
  holdings: InvestmentPreviewHolding[];
  activities: InvestmentPreviewActivity[];
  warnings: string[];
};

function formatDisplayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
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

export function InvestmentPreviewClient() {
  const [isPending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvestmentPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPreview(null);

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

      setPreview(payload as InvestmentPreviewResponse);
    } catch {
      setError("Could not load the investment preview right now.");
    }
  }

  return (
    <section className="stack">
      <article className="card stack compact">
        <div className="page-actions">
          <div>
            <h2>Preview a workbook</h2>
            <p className="muted-text">
              This sidecar is preview-only. It shows parsed holdings and metadata before
              we wire any persistence or account mapping.
            </p>
          </div>
          <span className="badge badge-neutral">Excel only</span>
        </div>

        <form
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
      </article>

      {error ? <p className="status error">{error}</p> : null}

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
                <span>Account label</span>
              </div>
              <div>
                <strong>{formatSnapshotValue(preview.snapshotDate)}</strong>
                <span>Snapshot date</span>
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
                Parsed rows stay in preview form for now. We will map them into the
                investment data model in a later slice.
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
                Current sample files are holdings snapshots, so this section is ready for a
                later activity export without blocking the preview flow.
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
                      <th>Asset</th>
                      <th>Quantity</th>
                      <th>Total</th>
                      <th>Currency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.activities.map((activity) => (
                      <tr key={`${activity.activityDate}-${activity.assetName}-${activity.activityType}`}>
                        <td>{activity.activityDate}</td>
                        <td>{activity.activityType}</td>
                        <td>{activity.assetName}</td>
                        <td>{formatDisplayValue(activity.quantity)}</td>
                        <td>{formatDisplayValue(activity.totalAmount)}</td>
                        <td>{activity.currency ?? "-"}</td>
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
            Upload an investment workbook to see the parsed preview here.
          </p>
        </article>
      )}
    </section>
  );
}
