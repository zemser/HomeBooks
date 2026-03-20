"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  formatAllocationSummary,
  formatClassificationSummary,
  formatDecisionSourceLabel,
  formatMoneyDisplay,
  getTransactionMerchant,
} from "@/features/expenses/presentation";
import type { ExpenseTransactionItem } from "@/features/expenses/types";

type ExpensesResponse = {
  transactions?: ExpenseTransactionItem[];
  error?: string;
};

export function ExpensesPageClient() {
  const [transactions, setTransactions] = useState<ExpenseTransactionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTransactions() {
      try {
        const response = await fetch("/api/expenses");
        const data = (await response.json()) as ExpensesResponse;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setError(data.error ?? "Could not load expenses.");
          setTransactions([]);
          return;
        }

        setTransactions(data.transactions ?? []);
      } catch {
        if (!cancelled) {
          setError("Could not load expenses.");
          setTransactions([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadTransactions();

    return () => {
      cancelled = true;
    };
  }, []);

  const reviewCount = transactions.filter((transaction) => !transaction.classification).length;

  return (
    <section className="stack">
      <article className="card">
        <div className="summary-strip">
          <div>
            <strong>{transactions.length}</strong>
            <span>Persisted transactions</span>
          </div>
          <div>
            <strong>{reviewCount}</strong>
            <span>Still need review</span>
          </div>
        </div>
      </article>

      <article className="card">
        <div className="page-actions">
          <div>
            <h2>All transactions</h2>
            <p className="muted-text">
              Review state is visible here, but edits stay in the review queue for this
              slice.
            </p>
          </div>
          <Link className="button" href="/imports/review">
            Open review queue
          </Link>
        </div>

        {isLoading ? <p className="status">Loading expenses...</p> : null}
        {error ? <p className="status error">{error}</p> : null}

        {!isLoading && !error && transactions.length === 0 ? (
          <p className="empty-state">
            No persisted transactions yet. Save an import first and they will show up here.
          </p>
        ) : null}

        {!isLoading && !error && transactions.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Original</th>
                  <th>Settlement</th>
                  <th>Normalized</th>
                  <th>Account</th>
                  <th>Import source</th>
                  <th>Classification</th>
                  <th>Allocation</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{transaction.transactionDate}</td>
                    <td>
                      <strong>{getTransactionMerchant(transaction)}</strong>
                      <div className="table-note">{transaction.description}</div>
                    </td>
                    <td>
                      {formatMoneyDisplay(
                        transaction.originalAmount,
                        transaction.originalCurrency,
                        transaction.direction,
                      )}
                    </td>
                    <td>
                      {formatMoneyDisplay(
                        transaction.settlementAmount,
                        transaction.settlementCurrency,
                        transaction.direction,
                      )}
                    </td>
                    <td>
                      {formatMoneyDisplay(
                        transaction.normalizedAmount,
                        transaction.workspaceCurrency,
                        transaction.direction,
                      )}
                    </td>
                    <td>{transaction.accountDisplayName}</td>
                    <td>
                      <strong>{transaction.importSourceName ?? "Unknown source"}</strong>
                      <div className="table-note">{transaction.importOriginalFilename}</div>
                    </td>
                    <td>
                      <span
                        className={`badge ${transaction.classification ? "badge-neutral" : "badge-warning"}`}
                      >
                        {formatClassificationSummary(transaction.classification)}
                      </span>
                      {transaction.classification ? (
                        <div className="table-note">
                          {formatDecisionSourceLabel(transaction.classification.decidedBy)}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`badge ${transaction.allocation?.reportingMode === "allocated_period" ? "badge-warning" : "badge-neutral"}`}
                      >
                        {formatAllocationSummary(transaction.allocation)}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="link-button"
                        href={`/imports/review?transactionId=${transaction.id}`}
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </article>
    </section>
  );
}
