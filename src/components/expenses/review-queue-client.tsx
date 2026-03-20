"use client";

import { useEffect, useState, useTransition } from "react";

import { CLASSIFICATION_TYPES, type ClassificationType } from "@/features/expenses/constants";
import {
  formatClassificationSummary,
  formatDecisionSourceLabel,
  formatMoneyDisplay,
  getTransactionMerchant,
} from "@/features/expenses/presentation";
import type {
  ExpenseTransactionItem,
  ReviewQueueResponse,
  WorkspaceMemberOption,
} from "@/features/expenses/types";

type ReviewQueueClientProps = {
  initialTransactionId: string | null;
};

type SingleFormState = {
  classificationType: ClassificationType | "";
  category: string;
  memberOwnerId: string;
  createRule: boolean;
};

type BulkFormState = {
  classificationType: ClassificationType | "";
  category: string;
  memberOwnerId: string;
};

const emptySingleForm: SingleFormState = {
  classificationType: "",
  category: "",
  memberOwnerId: "",
  createRule: false,
};

const emptyBulkForm: BulkFormState = {
  classificationType: "",
  category: "",
  memberOwnerId: "",
};

function getSelectedTransaction(input: {
  queue: ExpenseTransactionItem[];
  focusTransaction: ExpenseTransactionItem | null;
  selectedTransactionId: string | null;
}) {
  if (!input.selectedTransactionId) {
    return null;
  }

  return (
    input.queue.find((transaction) => transaction.id === input.selectedTransactionId) ??
    (input.focusTransaction?.id === input.selectedTransactionId ? input.focusTransaction : null)
  );
}

export function ReviewQueueClient({ initialTransactionId }: ReviewQueueClientProps) {
  const [queue, setQueue] = useState<ExpenseTransactionItem[]>([]);
  const [focusTransaction, setFocusTransaction] =
    useState<ExpenseTransactionItem | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberOption[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(
    initialTransactionId,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [singleForm, setSingleForm] = useState<SingleFormState>(emptySingleForm);
  const [bulkForm, setBulkForm] = useState<BulkFormState>(emptyBulkForm);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSavingSingle, startSavingSingle] = useTransition();
  const [isSavingBulk, startSavingBulk] = useTransition();

  async function loadQueue(focusId?: string | null) {
    setError(null);

    try {
      const search = focusId ? `?transactionId=${encodeURIComponent(focusId)}` : "";
      const response = await fetch(`/api/imports/review${search}`);
      const data = (await response.json()) as ReviewQueueResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not load the review queue.");
      }

      setQueue(data.queue);
      setFocusTransaction(data.focusTransaction ?? null);
      setMembers(data.members);
      setSelectedIds((current) =>
        current.filter((transactionId) =>
          data.queue.some((transaction) => transaction.id === transactionId),
        ),
      );
      setSelectedTransactionId((current) => {
        if (
          current &&
          (data.queue.some((transaction) => transaction.id === current) ||
            data.focusTransaction?.id === current)
        ) {
          return current;
        }

        if (focusId && data.focusTransaction?.id === focusId) {
          return focusId;
        }

        return data.focusTransaction?.id ?? data.queue[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load the review queue.",
      );
      setQueue([]);
      setFocusTransaction(null);
      setMembers([]);
      setSelectedTransactionId(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setIsLoading(true);
    void loadQueue(initialTransactionId);
  }, [initialTransactionId]);

  const selectedTransaction = getSelectedTransaction({
    queue,
    focusTransaction,
    selectedTransactionId,
  });
  const allQueueIds = queue.map((transaction) => transaction.id);
  const allVisibleSelected =
    allQueueIds.length > 0 && allQueueIds.every((transactionId) => selectedIds.includes(transactionId));

  useEffect(() => {
    if (!selectedTransaction) {
      setSingleForm(emptySingleForm);
      return;
    }

    setSingleForm({
      classificationType: selectedTransaction.classification?.classificationType ?? "",
      category: selectedTransaction.classification?.category ?? "",
      memberOwnerId: selectedTransaction.classification?.memberOwnerId ?? "",
      createRule: false,
    });
  }, [selectedTransaction]);

  function toggleSelectedTransaction(transactionId: string) {
    setSelectedIds((current) =>
      current.includes(transactionId)
        ? current.filter((value) => value !== transactionId)
        : [...current, transactionId],
    );
  }

  function toggleAllVisible() {
    setSelectedIds(allVisibleSelected ? [] : allQueueIds);
  }

  async function submitSingleClassification() {
    if (!selectedTransaction || !singleForm.classificationType) {
      setError("Choose a transaction and classification type before saving.");
      return;
    }

    setError(null);
    setMessage(null);

    const response = await fetch("/api/transaction-classifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transactionId: selectedTransaction.id,
        classificationType: singleForm.classificationType,
        category: singleForm.category,
        memberOwnerId: singleForm.memberOwnerId || null,
        createRule: singleForm.createRule,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(data.error ?? "Could not save this classification.");
      return;
    }

    const shouldKeepFocus =
      initialTransactionId === selectedTransaction.id || !selectedTransactionInQueue;

    await loadQueue(shouldKeepFocus ? selectedTransaction.id : null);
    setMessage(singleForm.createRule ? "Classification and rule saved." : "Classification saved.");
  }

  async function submitBulkClassification() {
    if (!bulkForm.classificationType) {
      setError("Choose a classification type before applying a bulk update.");
      return;
    }

    if (selectedIds.length === 0) {
      setError("Select at least one queue row before applying a bulk update.");
      return;
    }

    setError(null);
    setMessage(null);

    const response = await fetch("/api/transaction-classifications/bulk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transactionIds: selectedIds,
        classificationType: bulkForm.classificationType,
        category: bulkForm.category,
        memberOwnerId: bulkForm.memberOwnerId || null,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(data.error ?? "Could not apply the bulk classification.");
      return;
    }

    setSelectedIds([]);
    await loadQueue(null);
    setMessage("Bulk classification applied.");
  }

  const selectedTransactionInQueue = Boolean(
    selectedTransaction && queue.some((transaction) => transaction.id === selectedTransaction.id),
  );
  const merchantCanCreateRule = Boolean(selectedTransaction?.merchantRaw?.trim());

  return (
    <section className="stack">
      <article className="card">
        <div className="summary-strip">
          <div>
            <strong>{queue.length}</strong>
            <span>Transactions waiting for review</span>
          </div>
          <div>
            <strong>{selectedIds.length}</strong>
            <span>Selected for bulk action</span>
          </div>
        </div>
      </article>

      {error ? <p className="status error">{error}</p> : null}
      {message ? <p className="status">{message}</p> : null}

      <section className="review-layout">
        <article className="card review-list">
          <div className="page-actions">
            <div>
              <h2>Needs review</h2>
              <p className="muted-text">
                Queue membership is strict for now: only transactions without a saved
                classification row appear here.
              </p>
            </div>
          </div>

          <div className="stack compact">
            <div className="inline-form">
              <label className="field">
                <span>Bulk classification type</span>
                <select
                  className="input"
                  value={bulkForm.classificationType}
                  onChange={(event) =>
                    setBulkForm((current) => ({
                      ...current,
                      classificationType: event.target.value as ClassificationType | "",
                    }))
                  }
                >
                  <option value="">Select type</option>
                  {CLASSIFICATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Category</span>
                <input
                  className="input"
                  value={bulkForm.category}
                  onChange={(event) =>
                    setBulkForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Member owner</span>
                <select
                  className="input"
                  value={bulkForm.memberOwnerId}
                  onChange={(event) =>
                    setBulkForm((current) => ({
                      ...current,
                      memberOwnerId: event.target.value,
                    }))
                  }
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="action-row">
              <button
                className="button"
                type="button"
                disabled={isSavingBulk}
                onClick={() => startSavingBulk(() => void submitBulkClassification())}
              >
                {isSavingBulk ? "Applying..." : "Apply to selected rows"}
              </button>
              <button className="link-button" type="button" onClick={toggleAllVisible}>
                {allVisibleSelected ? "Clear visible selection" : "Select all visible rows"}
              </button>
            </div>
          </div>

          {isLoading ? <p className="status">Loading review queue...</p> : null}

          {!isLoading && queue.length === 0 ? (
            <p className="empty-state">
              No transactions are waiting for review right now.
            </p>
          ) : null}

          {!isLoading && queue.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="checkbox-cell">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        aria-label="Select all visible rows"
                      />
                    </th>
                    <th>Date</th>
                    <th>Merchant</th>
                    <th>Normalized</th>
                    <th>Account</th>
                    <th>Import source</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {queue.map((transaction) => (
                    <tr
                      className={
                        selectedTransactionId === transaction.id ? "table-row-active" : undefined
                      }
                      key={transaction.id}
                    >
                      <td className="checkbox-cell">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(transaction.id)}
                          onChange={() => toggleSelectedTransaction(transaction.id)}
                          aria-label={`Select ${getTransactionMerchant(transaction)}`}
                        />
                      </td>
                      <td>{transaction.transactionDate}</td>
                      <td>
                        <strong>{getTransactionMerchant(transaction)}</strong>
                        <div className="table-note">{transaction.description}</div>
                      </td>
                      <td>
                        {formatMoneyDisplay(
                          transaction.normalizedAmount,
                          transaction.workspaceCurrency,
                          transaction.direction,
                        )}
                      </td>
                      <td>{transaction.accountDisplayName}</td>
                      <td>{transaction.importSourceName ?? "Unknown source"}</td>
                      <td>
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => setSelectedTransactionId(transaction.id)}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </article>

        <article className="card review-detail">
          <div className="page-actions">
            <div>
              <h2>Selected transaction</h2>
              <p className="muted-text">
                Save one row at a time here. You can also open already-classified items from
                the expenses page to correct them.
              </p>
            </div>
          </div>

          {!selectedTransaction ? (
            <p className="empty-state">
              Select a queue row to review it. If you came from `/expenses`, the chosen
              transaction will appear here automatically.
            </p>
          ) : (
            <div className="stack">
              {!selectedTransactionInQueue && focusTransaction ? (
                <p className="status warning">
                  This transaction is already classified, so it is shown here as a focused
                  edit rather than as part of the default queue.
                </p>
              ) : null}

              <div className="meta-grid">
                <div>
                  <strong>Date</strong>
                  <p>{selectedTransaction.transactionDate}</p>
                </div>
                <div>
                  <strong>Merchant</strong>
                  <p>{getTransactionMerchant(selectedTransaction)}</p>
                </div>
                <div>
                  <strong>Original</strong>
                  <p>
                    {formatMoneyDisplay(
                      selectedTransaction.originalAmount,
                      selectedTransaction.originalCurrency,
                      selectedTransaction.direction,
                    )}
                  </p>
                </div>
                <div>
                  <strong>Normalized</strong>
                  <p>
                    {formatMoneyDisplay(
                      selectedTransaction.normalizedAmount,
                      selectedTransaction.workspaceCurrency,
                      selectedTransaction.direction,
                    )}
                  </p>
                </div>
                <div>
                  <strong>Account</strong>
                  <p>{selectedTransaction.accountDisplayName}</p>
                </div>
                <div>
                  <strong>Import source</strong>
                  <p>{selectedTransaction.importSourceName ?? "Unknown source"}</p>
                </div>
              </div>

              <div className="stack compact">
                <span
                  className={`badge ${selectedTransaction.classification ? "badge-neutral" : "badge-warning"}`}
                >
                  {formatClassificationSummary(selectedTransaction.classification)}
                </span>
                {selectedTransaction.classification ? (
                  <p className="table-note">
                    {formatDecisionSourceLabel(selectedTransaction.classification.decidedBy)}
                  </p>
                ) : null}
              </div>

              <div className="stack compact">
                <label className="field">
                  <span>Classification type</span>
                  <select
                    className="input"
                    value={singleForm.classificationType}
                    onChange={(event) =>
                      setSingleForm((current) => ({
                        ...current,
                        classificationType: event.target.value as ClassificationType | "",
                      }))
                    }
                  >
                    <option value="">Select type</option>
                    {CLASSIFICATION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Category</span>
                  <input
                    className="input"
                    value={singleForm.category}
                    onChange={(event) =>
                      setSingleForm((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>Member owner</span>
                  <select
                    className="input"
                    value={singleForm.memberOwnerId}
                    onChange={(event) =>
                      setSingleForm((current) => ({
                        ...current,
                        memberOwnerId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={singleForm.createRule}
                    disabled={!merchantCanCreateRule}
                    onChange={(event) =>
                      setSingleForm((current) => ({
                        ...current,
                        createRule: event.target.checked,
                      }))
                    }
                  />
                  <span>Create an exact merchant rule from this review</span>
                </label>
                {!merchantCanCreateRule ? (
                  <p className="helper-text">
                    Merchant rule creation is only available when the transaction has a
                    merchant value.
                  </p>
                ) : null}
              </div>

              <div className="action-row">
                <button
                  className="button"
                  type="button"
                  disabled={isSavingSingle}
                  onClick={() => startSavingSingle(() => void submitSingleClassification())}
                >
                  {isSavingSingle ? "Saving..." : "Save classification"}
                </button>
              </div>
            </div>
          )}
        </article>
      </section>
    </section>
  );
}
