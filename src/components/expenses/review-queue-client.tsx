"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import {
  AllocationEditor,
  createAllocationFormState,
  emptyAllocationForm,
  type AllocationFormState,
} from "@/components/expenses/allocation-editor";
import { CLASSIFICATION_TYPES, type ClassificationType } from "@/features/expenses/constants";
import {
  formatAllocationSummary,
  formatClassificationSummary,
  formatDecisionSourceLabel,
  formatMoneyDisplay,
  getTransactionMerchant,
} from "@/features/expenses/presentation";
import type {
  ExpenseTransactionItem,
  ReviewQueueImportSummary,
  ReviewQueueResponse,
  ReviewQueueSummary,
  WorkspaceMemberOption,
} from "@/features/expenses/types";

type ReviewQueueClientProps = {
  initialData: ReviewQueueResponse;
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

const emptyReviewSummary: ReviewQueueSummary = {
  totalTransactionCount: 0,
  reviewedCount: 0,
  queueCount: 0,
  completionPercentage: 100,
  remainingByImport: [],
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

function formatReviewImportRange(item: ReviewQueueImportSummary) {
  if (!item.earliestTransactionDate || !item.latestTransactionDate) {
    return "Unknown period";
  }

  const earliest = item.earliestTransactionDate.slice(0, 7);
  const latest = item.latestTransactionDate.slice(0, 7);

  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  if (earliest === latest) {
    return formatter.format(new Date(`${earliest}-01T00:00:00.000Z`));
  }

  return `${formatter.format(new Date(`${earliest}-01T00:00:00.000Z`))} to ${formatter.format(
    new Date(`${latest}-01T00:00:00.000Z`),
  )}`;
}

export function ReviewQueueClient({
  initialData,
  initialTransactionId,
}: ReviewQueueClientProps) {
  const [queue, setQueue] = useState<ExpenseTransactionItem[]>(initialData.queue);
  const [focusTransaction, setFocusTransaction] = useState<ExpenseTransactionItem | null>(
    initialData.focusTransaction,
  );
  const [members, setMembers] = useState<WorkspaceMemberOption[]>(initialData.members);
  const [summary, setSummary] = useState<ReviewQueueSummary>(initialData.summary);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(
    initialTransactionId ?? initialData.focusTransaction?.id ?? initialData.queue[0]?.id ?? null,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [singleForm, setSingleForm] = useState<SingleFormState>(emptySingleForm);
  const [bulkForm, setBulkForm] = useState<BulkFormState>(emptyBulkForm);
  const [allocationForm, setAllocationForm] = useState<AllocationFormState>(emptyAllocationForm);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSavingSingle, startSavingSingle] = useTransition();
  const [isSavingBulk, startSavingBulk] = useTransition();
  const [isSavingAllocation, startSavingAllocation] = useTransition();

  function applyQueueData(data: ReviewQueueResponse, focusId?: string | null) {
    setQueue(data.queue);
    setFocusTransaction(data.focusTransaction ?? null);
    setMembers(data.members);
    setSummary(data.summary);
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
  }

  async function loadQueue(focusId?: string | null) {
    setError(null);

    try {
      const search = focusId ? `?transactionId=${encodeURIComponent(focusId)}` : "";
      const response = await fetch(`/api/imports/review${search}`);
      const data = (await response.json()) as ReviewQueueResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not load the review queue.");
      }

      applyQueueData(data, focusId);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load the review queue.",
      );
      setQueue([]);
      setFocusTransaction(null);
      setMembers([]);
      setSummary(emptyReviewSummary);
      setSelectedTransactionId(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setQueue(initialData.queue);
    setFocusTransaction(initialData.focusTransaction ?? null);
    setMembers(initialData.members);
    setSummary(initialData.summary);
    setSelectedIds([]);
    setSelectedTransactionId(
      initialTransactionId ??
        initialData.focusTransaction?.id ??
        initialData.queue[0]?.id ??
        null,
    );
    setError(null);
    setIsLoading(false);
  }, [initialData, initialTransactionId]);

  const selectedTransaction = getSelectedTransaction({
    queue,
    focusTransaction,
    selectedTransactionId,
  });
  const allQueueIds = queue.map((transaction) => transaction.id);
  const allVisibleSelected =
    allQueueIds.length > 0 &&
    allQueueIds.every((transactionId) => selectedIds.includes(transactionId));

  useEffect(() => {
    if (!selectedTransaction) {
      setSingleForm(emptySingleForm);
      setAllocationForm(emptyAllocationForm);
      return;
    }

    setSingleForm({
      classificationType: selectedTransaction.classification?.classificationType ?? "",
      category: selectedTransaction.classification?.category ?? "",
      memberOwnerId: selectedTransaction.classification?.memberOwnerId ?? "",
      createRule: false,
    });

    setAllocationForm(
      createAllocationFormState({
        allocation: selectedTransaction.allocation,
        sourceDate: selectedTransaction.transactionDate,
        totalAmount: selectedTransaction.normalizedAmount,
      }),
    );
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

  async function submitAllocationUpdate() {
    if (!selectedTransaction) {
      setError("Choose a transaction before saving its allocation.");
      return;
    }

    if (!selectedTransaction.classification) {
      setError("Save a classification before editing adjusted-period allocation.");
      return;
    }

    setError(null);
    setMessage(null);

    const response = await fetch("/api/transaction-allocations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourceType: "transaction",
        sourceId: selectedTransaction.id,
        reportingMode: allocationForm.reportingMode,
        allocationStrategy:
          allocationForm.reportingMode === "allocated_period"
            ? allocationForm.allocationStrategy
            : null,
        coverageStartDate:
          allocationForm.reportingMode === "allocated_period" &&
          allocationForm.allocationStrategy === "equal_split"
            ? allocationForm.coverageStartDate
            : null,
        coverageEndDate:
          allocationForm.reportingMode === "allocated_period" &&
          allocationForm.allocationStrategy === "equal_split"
            ? allocationForm.coverageEndDate
            : null,
        allocations:
          allocationForm.reportingMode === "allocated_period" &&
          allocationForm.allocationStrategy === "manual_split"
            ? allocationForm.allocations
            : null,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(data.error ?? "Could not save this allocation.");
      return;
    }

    await loadQueue(selectedTransaction.id);
    setMessage(
      allocationForm.reportingMode === "allocated_period"
        ? "Adjusted-period allocation saved."
        : "Allocation reset to payment month.",
    );
  }

  const selectedTransactionInQueue = Boolean(
    selectedTransaction && queue.some((transaction) => transaction.id === selectedTransaction.id),
  );
  const selectedQueuePosition =
    selectedTransactionInQueue && selectedTransaction
      ? queue.findIndex((transaction) => transaction.id === selectedTransaction.id) + 1
      : null;
  const merchantCanCreateRule = Boolean(selectedTransaction?.merchantRaw?.trim());
  const allocationEditable =
    selectedTransaction?.classification &&
    selectedTransaction.classification.classificationType !== "transfer" &&
    selectedTransaction.classification.classificationType !== "ignore";
  const selectedLedgerHref = selectedTransaction
    ? `/expenses?transactionId=${selectedTransaction.id}`
    : "/expenses";
  const selectedReportHref =
    selectedTransaction?.classification &&
    selectedTransaction.transactionDate.length >= 7
      ? `/reports?month=${selectedTransaction.transactionDate.slice(0, 7)}`
      : null;

  return (
    <section className="stack">
      <article className="card stack compact">
        <div className="summary-strip">
          <div>
            <strong>{summary.queueCount}</strong>
            <span>Transactions left to review</span>
          </div>
          <div>
            <strong>{summary.reviewedCount}</strong>
            <span>Already reviewed</span>
          </div>
          <div>
            <strong>{summary.completionPercentage}%</strong>
            <span>Queue cleared</span>
          </div>
          <div>
            <strong>{selectedQueuePosition ? `${selectedQueuePosition}/${summary.queueCount}` : "-"}</strong>
            <span>Selected position</span>
          </div>
        </div>

        <div className="progress-meter" aria-hidden="true">
          <span
            className="progress-meter-fill"
            style={{ width: `${summary.completionPercentage}%` }}
          />
        </div>

        {summary.remainingByImport.length > 0 ? (
          <div className="stack compact">
            <p className="helper-text">What&apos;s left by import</p>
            {summary.remainingByImport.map((item) => (
              <div className="activity-row" key={item.importId}>
                <div>
                  <strong>{item.originalFilename}</strong>
                  <p>
                    {item.sourceName ?? "Unknown source"} · {item.remainingCount} left ·{" "}
                    {item.reviewedCount} reviewed
                  </p>
                </div>
                <div className="activity-meta">
                  <span
                    className={`badge ${
                      item.reviewedCount > 0 ? "badge-warning" : "badge-neutral"
                    }`}
                  >
                    {item.reviewedCount > 0 ? "In progress" : "Unstarted"}
                  </span>
                  <span>{formatReviewImportRange(item)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
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

            <div className="page-actions">
              <p className="helper-text">
                {selectedIds.length > 0
                  ? `${selectedIds.length} queue row${selectedIds.length === 1 ? "" : "s"} selected for bulk review.`
                  : "Select matching rows when you want to clear a batch in one decision."}
              </p>
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
          </div>

          {isLoading ? <p className="status">Loading review queue...</p> : null}

          {!isLoading && queue.length === 0 ? (
            summary.totalTransactionCount > 0 ? (
              <div className="home-focus-card">
                <span className="badge badge-neutral">Queue clear</span>
                <h3>Imported transactions no longer need review.</h3>
                <p>
                  The review bridge is done for now, so the next useful stop is the ledger
                  or the matching report month.
                </p>
                <div className="action-row">
                  <Link className="button" href="/expenses">
                    Open ledger
                  </Link>
                  <Link className="button button-secondary" href="/reports">
                    Open reports
                  </Link>
                </div>
              </div>
            ) : (
              <p className="empty-state">No transactions are waiting for review right now.</p>
            )
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
                <div>
                  <strong>Import file</strong>
                  <p>{selectedTransaction.importOriginalFilename}</p>
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
                {selectedQueuePosition ? (
                  <p className="table-note">
                    Item {selectedQueuePosition} of {summary.queueCount} left in the queue.
                  </p>
                ) : null}
                <p className="table-note">
                  Allocation: {formatAllocationSummary(selectedTransaction.allocation)}
                </p>
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
                <Link className="button button-secondary" href={selectedLedgerHref}>
                  Open in ledger
                </Link>
                {selectedReportHref ? (
                  <Link className="link-button" href={selectedReportHref}>
                    Open report month
                  </Link>
                ) : null}
              </div>

              <div className="card stack compact">
                <div>
                  <h3>Adjusted-period allocation</h3>
                  <p className="muted-text">
                    Keep payment-date behavior or split this transaction across the months it
                    actually belongs to.
                  </p>
                </div>

                {!allocationEditable ? (
                  <p className="helper-text">
                    Save a reportable classification first to enable allocation editing.
                  </p>
                ) : (
                  <AllocationEditor
                    currency={selectedTransaction.workspaceCurrency}
                    direction={selectedTransaction.direction}
                    form={allocationForm}
                    isSaving={isSavingAllocation}
                    onSave={() => startSavingAllocation(() => void submitAllocationUpdate())}
                    setForm={setAllocationForm}
                    sourceDate={selectedTransaction.transactionDate}
                    totalAmount={selectedTransaction.normalizedAmount}
                  />
                )}
              </div>
            </div>
          )}
        </article>
      </section>
    </section>
  );
}
