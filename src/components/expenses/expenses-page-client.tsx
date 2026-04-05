"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState, useTransition } from "react";

import {
  AllocationEditor,
  createAllocationFormState,
  emptyAllocationForm,
  type AllocationFormState,
} from "@/components/expenses/allocation-editor";
import {
  formatAllocationSummary,
  formatClassificationSummary,
  formatDecisionSourceLabel,
  formatManualEntryClassificationSummary,
  formatMoneyDisplay,
  getTransactionMerchant,
} from "@/features/expenses/presentation";
import type {
  ExpenseTransactionItem,
  ExpensesPageData,
  WorkspaceMemberOption,
} from "@/features/expenses/types";
import {
  ONE_TIME_MANUAL_ENTRY_EVENT_KINDS,
  type OneTimeManualEntryClassificationType,
  type OneTimeManualEntryEventKind,
} from "@/features/manual-entries/constants";
import type { OneTimeManualEntryItem } from "@/features/manual-entries/types";

type ExpensesPageClientProps = {
  initialData: ExpensesPageData;
  initialTransactionId: string | null;
};

type ExpensesResponse = Partial<ExpensesPageData> & {
  error?: string;
};

type ManualEntryMutationResponse = {
  manualEntryId?: string;
  error?: string;
};

type AllocationMutationResponse = {
  sourceId?: string;
  sourceType?: "transaction" | "manual";
  error?: string;
};

type ManualEntryFormState = {
  title: string;
  eventKind: OneTimeManualEntryEventKind;
  classificationType: OneTimeManualEntryClassificationType;
  payerMemberId: string;
  category: string;
  amount: string;
  eventDate: string;
};

type LoadExpensesOptions = {
  manualEntryId?: string | null;
  transactionId?: string | null;
};

type ReviewStatusFilter = "all" | "needs_review" | "reviewed";

const EXPENSE_CLASSIFICATION_OPTIONS: OneTimeManualEntryClassificationType[] = [
  "household",
  "shared",
  "personal",
];
const INCOME_CLASSIFICATION_OPTIONS: OneTimeManualEntryClassificationType[] = ["income"];

function todayDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createInitialManualEntryFormState(): ManualEntryFormState {
  return {
    title: "",
    eventKind: "expense",
    classificationType: "household",
    payerMemberId: "",
    category: "",
    amount: "",
    eventDate: todayDateInputValue(),
  };
}

function manualEntryToFormState(entry: OneTimeManualEntryItem): ManualEntryFormState {
  return {
    title: entry.title,
    eventKind: entry.eventKind,
    classificationType: entry.classificationType,
    payerMemberId: entry.payerMemberId ?? "",
    category: entry.category ?? "",
    amount: Number(entry.originalAmount).toFixed(2),
    eventDate: entry.eventDate,
  };
}

function listClassificationOptions(
  eventKind: OneTimeManualEntryEventKind,
): OneTimeManualEntryClassificationType[] {
  return eventKind === "income"
    ? INCOME_CLASSIFICATION_OPTIONS
    : EXPENSE_CLASSIFICATION_OPTIONS;
}

function allocationSuccessMessage(form: AllocationFormState) {
  return form.reportingMode === "allocated_period"
    ? "Adjusted-period allocation saved."
    : "Allocation reset to payment month.";
}

function transactionMonth(value: string) {
  return value.slice(0, 7);
}

function formatLedgerMonthLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00.000Z`));
}

export function ExpensesPageClient({
  initialData,
  initialTransactionId,
}: ExpensesPageClientProps) {
  const [transactions, setTransactions] = useState<ExpenseTransactionItem[]>(
    initialData.transactions,
  );
  const [oneTimeManualEntries, setOneTimeManualEntries] = useState<OneTimeManualEntryItem[]>(
    initialData.oneTimeManualEntries,
  );
  const [members, setMembers] = useState<WorkspaceMemberOption[]>(initialData.members);
  const [selectedManualEntryId, setSelectedManualEntryId] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(
    initialTransactionId,
  );
  const [manualEntryForm, setManualEntryForm] = useState<ManualEntryFormState>(
    createInitialManualEntryFormState(),
  );
  const [manualEntryAllocationForm, setManualEntryAllocationForm] =
    useState<AllocationFormState>(emptyAllocationForm);
  const [transactionAllocationForm, setTransactionAllocationForm] =
    useState<AllocationFormState>(emptyAllocationForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<ReviewStatusFilter>("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [importFilter, setImportFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isSavingManualEntry, startSavingManualEntry] = useTransition();
  const [isDeletingManualEntry, startDeletingManualEntry] = useTransition();
  const [isSavingManualAllocation, startSavingManualAllocation] = useTransition();
  const [isSavingTransactionAllocation, startSavingTransactionAllocation] = useTransition();
  const deferredSearchQuery = useDeferredValue(searchQuery);

  function applyExpensesData(
    data: ExpensesPageData,
    options?: LoadExpensesOptions,
  ) {
    const nextTransactions = data.transactions;
    const nextOneTimeManualEntries = data.oneTimeManualEntries;
    const nextMembers = data.members;

    setTransactions(nextTransactions);
    setOneTimeManualEntries(nextOneTimeManualEntries);
    setMembers(nextMembers);
    setSelectedManualEntryId((current) => {
      if (options?.manualEntryId !== undefined) {
        return options.manualEntryId &&
          nextOneTimeManualEntries.some((entry) => entry.id === options.manualEntryId)
          ? options.manualEntryId
          : null;
      }

      return current && nextOneTimeManualEntries.some((entry) => entry.id === current)
        ? current
        : null;
    });
    setSelectedTransactionId((current) => {
      if (options?.transactionId !== undefined) {
        return options.transactionId &&
          nextTransactions.some((transaction) => transaction.id === options.transactionId)
          ? options.transactionId
          : null;
      }

      return current && nextTransactions.some((transaction) => transaction.id === current)
        ? current
        : null;
    });
  }

  async function loadExpenses(options?: LoadExpensesOptions) {
    setError(null);

    try {
      const response = await fetch("/api/expenses");
      const data = (await response.json()) as ExpensesResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Could not load expenses.");
      }

      applyExpensesData(
        {
          transactions: data.transactions ?? [],
          oneTimeManualEntries: data.oneTimeManualEntries ?? [],
          members: data.members ?? [],
        },
        options,
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load expenses.");
      setTransactions([]);
      setOneTimeManualEntries([]);
      setMembers([]);
      setSelectedManualEntryId(null);
      setSelectedTransactionId(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setTransactions(initialData.transactions);
    setOneTimeManualEntries(initialData.oneTimeManualEntries);
    setMembers(initialData.members);
    setSelectedManualEntryId(null);
    setSelectedTransactionId(initialTransactionId);
    setError(null);
    setIsLoading(false);
  }, [initialData, initialTransactionId]);

  const selectedManualEntry =
    oneTimeManualEntries.find((entry) => entry.id === selectedManualEntryId) ?? null;
  const selectedTransaction =
    transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null;
  const reviewCount = transactions.filter((transaction) => !transaction.classification).length;
  const isEditingManualEntry = Boolean(selectedManualEntry);
  const manualEntryClassificationOptions = listClassificationOptions(manualEntryForm.eventKind);
  const transactionAllocationEditable =
    selectedTransaction?.classification &&
    selectedTransaction.classification.classificationType !== "transfer" &&
    selectedTransaction.classification.classificationType !== "ignore";
  const manualEntryAllocationSourceDirty = Boolean(
    selectedManualEntry &&
      (Math.abs((Number(manualEntryForm.amount) || 0) - Number(selectedManualEntry.originalAmount)) >=
        0.000001 ||
        manualEntryForm.eventDate !== selectedManualEntry.eventDate),
  );
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();
  const visibleTransactions = transactions.filter((transaction) => {
    const matchesReviewStatus =
      reviewStatusFilter === "all" ||
      (reviewStatusFilter === "needs_review" && !transaction.classification) ||
      (reviewStatusFilter === "reviewed" && Boolean(transaction.classification));
    const matchesMonth =
      monthFilter === "all" || transactionMonth(transaction.transactionDate) === monthFilter;
    const matchesImport =
      importFilter === "all" || transaction.importOriginalFilename === importFilter;
    const matchesSearch =
      normalizedSearchQuery.length === 0 ||
      [
        getTransactionMerchant(transaction),
        transaction.description,
        transaction.accountDisplayName,
        transaction.importSourceName ?? "",
        transaction.importOriginalFilename,
        transaction.classification?.category ?? "",
        transaction.classification?.memberOwnerName ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearchQuery);

    return matchesReviewStatus && matchesMonth && matchesImport && matchesSearch;
  });
  const availableMonths = Array.from(
    new Set(transactions.map((transaction) => transactionMonth(transaction.transactionDate))),
  ).sort((left, right) => right.localeCompare(left));
  const availableImportFiles = Array.from(
    new Set(transactions.map((transaction) => transaction.importOriginalFilename)),
  ).sort((left, right) => left.localeCompare(right));
  const filtersActive =
    searchQuery.trim().length > 0 ||
    reviewStatusFilter !== "all" ||
    monthFilter !== "all" ||
    importFilter !== "all";
  const preferredReportMonth =
    (selectedTransaction ? transactionMonth(selectedTransaction.transactionDate) : null) ??
    (monthFilter !== "all" ? monthFilter : null) ??
    (visibleTransactions[0]
      ? transactionMonth(visibleTransactions[0].transactionDate)
      : null) ??
    (transactions[0] ? transactionMonth(transactions[0].transactionDate) : null);
  const reportHref = preferredReportMonth ? `/reports?month=${preferredReportMonth}` : "/reports";
  const reportLabel = preferredReportMonth
    ? `Open ${formatLedgerMonthLabel(preferredReportMonth)} report`
    : "Open reports";

  useEffect(() => {
    setManualEntryForm(
      selectedManualEntry
        ? manualEntryToFormState(selectedManualEntry)
        : createInitialManualEntryFormState(),
    );
    setManualEntryAllocationForm(
      selectedManualEntry
        ? createAllocationFormState({
            allocation: selectedManualEntry.allocation,
            sourceDate: selectedManualEntry.eventDate,
            totalAmount: selectedManualEntry.normalizedAmount,
          })
        : emptyAllocationForm,
    );
  }, [selectedManualEntry]);

  useEffect(() => {
    setTransactionAllocationForm(
      selectedTransaction
        ? createAllocationFormState({
            allocation: selectedTransaction.allocation,
            sourceDate: selectedTransaction.transactionDate,
            totalAmount: selectedTransaction.normalizedAmount,
          })
        : emptyAllocationForm,
    );
  }, [selectedTransaction]);

  useEffect(() => {
    if (
      selectedTransactionId &&
      !visibleTransactions.some((transaction) => transaction.id === selectedTransactionId)
    ) {
      setSelectedTransactionId(null);
    }
  }, [selectedTransactionId, visibleTransactions]);

  function startNewManualEntry() {
    setSelectedManualEntryId(null);
    setManualEntryForm(createInitialManualEntryFormState());
    setManualEntryAllocationForm(emptyAllocationForm);
    setError(null);
    setMessage(null);
  }

  function clearLedgerFilters() {
    setSearchQuery("");
    setReviewStatusFilter("all");
    setMonthFilter("all");
    setImportFilter("all");
  }

  function handleManualEntryKindChange(eventKind: OneTimeManualEntryEventKind) {
    setManualEntryForm((current) => ({
      ...current,
      eventKind,
      classificationType:
        eventKind === "income"
          ? "income"
          : current.classificationType === "income"
            ? "household"
            : current.classificationType,
    }));
  }

  async function submitManualEntry() {
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        selectedManualEntry
          ? `/api/manual-entries/${selectedManualEntry.id}`
          : "/api/manual-entries",
        {
          method: selectedManualEntry ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: manualEntryForm.title,
            eventKind: manualEntryForm.eventKind,
            classificationType: manualEntryForm.classificationType,
            payerMemberId: manualEntryForm.payerMemberId || null,
            category: manualEntryForm.category,
            amount: Number(manualEntryForm.amount),
            eventDate: manualEntryForm.eventDate,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as ManualEntryMutationResponse;

      if (!response.ok) {
        setError(payload.error ?? "Could not save the manual entry.");
        return;
      }

      await loadExpenses({
        manualEntryId: payload.manualEntryId ?? selectedManualEntry?.id ?? null,
        transactionId: selectedTransactionId,
      });
      setMessage(selectedManualEntry ? "Manual entry updated." : "Manual entry created.");
    } catch {
      setError("Could not save the manual entry.");
    }
  }

  async function deleteManualEntry(manualEntryId: string) {
    if (!window.confirm("Delete this one-time manual entry?")) {
      return;
    }

    setError(null);
    setMessage(null);
    setPendingDeleteId(manualEntryId);

    try {
      const response = await fetch(`/api/manual-entries/${manualEntryId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as ManualEntryMutationResponse;

      setPendingDeleteId(null);

      if (!response.ok) {
        setError(payload.error ?? "Could not delete the manual entry.");
        return;
      }

      await loadExpenses({
        manualEntryId: selectedManualEntryId === manualEntryId ? null : selectedManualEntryId,
        transactionId: selectedTransactionId,
      });
      setMessage("Manual entry deleted.");
    } catch {
      setPendingDeleteId(null);
      setError("Could not delete the manual entry.");
    }
  }

  async function submitAllocationUpdate(input: {
    sourceId: string;
    sourceType: "transaction" | "manual";
    form: AllocationFormState;
  }) {
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/transaction-allocations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          reportingMode: input.form.reportingMode,
          allocationStrategy:
            input.form.reportingMode === "allocated_period"
              ? input.form.allocationStrategy
              : null,
          coverageStartDate:
            input.form.reportingMode === "allocated_period" &&
            input.form.allocationStrategy === "equal_split"
              ? input.form.coverageStartDate
              : null,
          coverageEndDate:
            input.form.reportingMode === "allocated_period" &&
            input.form.allocationStrategy === "equal_split"
              ? input.form.coverageEndDate
              : null,
          allocations:
            input.form.reportingMode === "allocated_period" &&
            input.form.allocationStrategy === "manual_split"
              ? input.form.allocations
              : null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as AllocationMutationResponse;

      if (!response.ok) {
        setError(payload.error ?? "Could not save this allocation.");
        return;
      }

      await loadExpenses({
        manualEntryId:
          input.sourceType === "manual" ? input.sourceId : selectedManualEntryId,
        transactionId:
          input.sourceType === "transaction" ? input.sourceId : selectedTransactionId,
      });
      setMessage(allocationSuccessMessage(input.form));
    } catch {
      setError("Could not save this allocation.");
    }
  }

  return (
    <section className="stack">
      <article className="card">
        <div className="summary-strip">
          <div>
            <strong>{transactions.length}</strong>
            <span>Persisted transactions</span>
          </div>
          <div>
            <strong>{visibleTransactions.length}</strong>
            <span>Visible in ledger</span>
          </div>
          <div>
            <strong>{oneTimeManualEntries.length}</strong>
            <span>One-time manual entries</span>
          </div>
          <div>
            <strong>{reviewCount}</strong>
            <span>Still need review</span>
          </div>
        </div>
      </article>

      {reviewCount > 0 ? (
        <p className="status warning">
          {reviewCount} imported transaction{reviewCount === 1 ? "" : "s"} still need review.
          Use the filters below to focus on the rows you&apos;ve already checked, or jump back to
          the queue when you want to keep clearing it.
        </p>
      ) : null}
      {error ? <p className="status error">{error}</p> : null}
      {message ? <p className="status">{message}</p> : null}

      <section className="two-up">
        <article className="card">
          <div className="page-actions">
            <div>
              <h2>{isEditingManualEntry ? "Edit manual entry" : "Create manual entry"}</h2>
              <p className="muted-text">
                One-time manual entries stay separate from recurring rules, but shared
                expenses created here can also flow into settlements after you confirm
                payer and split details.
              </p>
            </div>
            {isEditingManualEntry ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={startNewManualEntry}
              >
                New entry
              </button>
            ) : null}
          </div>

          <form
            className="stack compact"
            onSubmit={(event) => {
              event.preventDefault();
              startSavingManualEntry(() => {
                void submitManualEntry();
              });
            }}
          >
            <label className="field">
              <span>Title</span>
              <input
                className="input"
                value={manualEntryForm.title}
                onChange={(event) =>
                  setManualEntryForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Annual bonus"
              />
            </label>

            <div className="inline-form">
              <label className="field">
                <span>Kind</span>
                <select
                  className="input"
                  value={manualEntryForm.eventKind}
                  onChange={(event) =>
                    handleManualEntryKindChange(
                      event.target.value as OneTimeManualEntryEventKind,
                    )
                  }
                >
                  {ONE_TIME_MANUAL_ENTRY_EVENT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Classification</span>
                <select
                  className="input"
                  value={manualEntryForm.classificationType}
                  onChange={(event) =>
                    setManualEntryForm((current) => ({
                      ...current,
                      classificationType:
                        event.target.value as OneTimeManualEntryClassificationType,
                    }))
                  }
                >
                  {manualEntryClassificationOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Payer / owner</span>
                <select
                  className="input"
                  value={manualEntryForm.payerMemberId}
                  onChange={(event) =>
                    setManualEntryForm((current) => ({
                      ...current,
                      payerMemberId: event.target.value,
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

            <div className="inline-form">
              <label className="field">
                <span>Category</span>
                <input
                  className="input"
                  value={manualEntryForm.category}
                  onChange={(event) =>
                    setManualEntryForm((current) => ({ ...current, category: event.target.value }))
                  }
                  placeholder="Salary"
                />
              </label>

              <label className="field">
                <span>Amount</span>
                <input
                  className="input"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  type="number"
                  value={manualEntryForm.amount}
                  onChange={(event) =>
                    setManualEntryForm((current) => ({ ...current, amount: event.target.value }))
                  }
                />
              </label>

              <label className="field">
                <span>Date</span>
                <input
                  className="input"
                  type="date"
                  value={manualEntryForm.eventDate}
                  onChange={(event) =>
                    setManualEntryForm((current) => ({
                      ...current,
                      eventDate: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="action-row">
              <button className="button" disabled={isSavingManualEntry} type="submit">
                {isSavingManualEntry
                  ? "Saving..."
                  : isEditingManualEntry
                    ? "Save manual entry"
                    : "Create manual entry"}
              </button>
              {isEditingManualEntry ? (
                <button className="link-button" type="button" onClick={startNewManualEntry}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>

          <div className="card stack compact">
            <div>
              <h3>Adjusted-period allocation</h3>
              <p className="muted-text">
                Keep payment-date behavior or split this one-time entry across the months
                it really belongs to.
              </p>
            </div>

            {!selectedManualEntry ? (
              <p className="helper-text">
                Create a manual entry first, or select one from the saved list to adjust
                its allocation.
              </p>
            ) : manualEntryAllocationSourceDirty ? (
              <p className="status warning">
                Save amount or date changes before editing allocation so reporting totals
                stay aligned.
              </p>
            ) : (
              <AllocationEditor
                currency={selectedManualEntry.workspaceCurrency}
                form={manualEntryAllocationForm}
                isSaving={isSavingManualAllocation}
                onSave={() =>
                  startSavingManualAllocation(() =>
                    void submitAllocationUpdate({
                      sourceId: selectedManualEntry.id,
                      sourceType: "manual",
                      form: manualEntryAllocationForm,
                    }),
                  )
                }
                setForm={setManualEntryAllocationForm}
                sourceDate={selectedManualEntry.eventDate}
                totalAmount={selectedManualEntry.normalizedAmount}
              />
            )}
          </div>
        </article>

        <article className="card">
          <div className="page-actions">
            <div>
              <h2>Saved manual entries</h2>
              <p className="muted-text">
                Select a row to edit its fields on the left and manage reporting
                allocation inline.
              </p>
            </div>
          </div>

          {oneTimeManualEntries.length > 0 ? (
            <p className="helper-text">
              Click any saved row to load it into the editor. Delete stays in the
              actions column.
            </p>
          ) : null}

          {isLoading ? <p className="status">Loading manual entries...</p> : null}

          {!isLoading && oneTimeManualEntries.length === 0 ? (
            <p className="empty-state">
              No one-time manual entries exist yet. Create shared reimbursements, rent
              corrections, bonuses, or other non-imported items here.
            </p>
          ) : null}

          {!isLoading && oneTimeManualEntries.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Title</th>
                    <th>Kind</th>
                    <th>Amount</th>
                    <th>Classification</th>
                    <th>Reporting</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {oneTimeManualEntries.map((entry) => (
                    <tr
                      className={`table-row-interactive ${
                        selectedManualEntryId === entry.id ? "table-row-active" : ""
                      }`.trim()}
                      key={entry.id}
                      onClick={() => setSelectedManualEntryId(entry.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedManualEntryId(entry.id);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td>{entry.eventDate}</td>
                      <td>
                        <strong>{entry.title}</strong>
                        <div className="table-note">{entry.payerMemberName ?? "Unassigned"}</div>
                        <button
                          className="link-button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedManualEntryId(entry.id);
                          }}
                        >
                          {selectedManualEntryId === entry.id ? "Editing now" : "Edit this entry"}
                        </button>
                      </td>
                      <td>{entry.eventKind}</td>
                      <td>{formatMoneyDisplay(entry.normalizedAmount, entry.workspaceCurrency)}</td>
                      <td>
                        <span className="badge badge-neutral">
                          {formatManualEntryClassificationSummary(entry)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            entry.allocation?.reportingMode === "allocated_period"
                              ? "badge-warning"
                              : "badge-neutral"
                          }`}
                        >
                          {formatAllocationSummary(entry.allocation)}
                        </span>
                      </td>
                      <td>
                        <div className="action-row">
                          <button
                            className="link-button"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedManualEntryId(entry.id);
                            }}
                          >
                            {selectedManualEntryId === entry.id ? "Editing" : "Edit"}
                          </button>
                          <button
                            className="link-button"
                            disabled={isDeletingManualEntry && pendingDeleteId === entry.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              startDeletingManualEntry(() => {
                                void deleteManualEntry(entry.id);
                              });
                            }}
                          >
                            {isDeletingManualEntry && pendingDeleteId === entry.id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </article>
      </section>

      <article className="card">
        <div className="page-actions">
          <div>
            <h2>Imported transactions</h2>
            <p className="muted-text">
              Classification still lives in the review queue, but reportable transactions
              can have their allocation corrected here without leaving `/expenses`.
            </p>
          </div>
          <div className="action-row">
            <Link className="button button-secondary" href="/imports/review">
              {reviewCount > 0 ? `Review ${reviewCount} left` : "Open review queue"}
            </Link>
            <Link className="button" href={reportHref}>
              {reportLabel}
            </Link>
          </div>
        </div>

        <div className="stack compact">
          <div className="inline-form">
            <label className="field">
              <span>Search</span>
              <input
                className="input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Merchant, description, account, or import file"
              />
            </label>
            <label className="field">
              <span>Review status</span>
              <select
                className="input"
                value={reviewStatusFilter}
                onChange={(event) =>
                  setReviewStatusFilter(event.target.value as ReviewStatusFilter)
                }
              >
                <option value="all">All rows</option>
                <option value="needs_review">Needs review</option>
                <option value="reviewed">Reviewed</option>
              </select>
            </label>
            <label className="field">
              <span>Month</span>
              <select
                className="input"
                value={monthFilter}
                onChange={(event) => setMonthFilter(event.target.value)}
              >
                <option value="all">All months</option>
                {availableMonths.map((month) => (
                  <option key={month} value={month}>
                    {formatLedgerMonthLabel(month)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Import file</span>
              <select
                className="input"
                value={importFilter}
                onChange={(event) => setImportFilter(event.target.value)}
              >
                <option value="all">All imports</option>
                {availableImportFiles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="page-actions">
            <p className="helper-text">
              Showing {visibleTransactions.length} of {transactions.length} imported
              transaction{transactions.length === 1 ? "" : "s"}.
            </p>
            {filtersActive ? (
              <button className="link-button" type="button" onClick={clearLedgerFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        {isLoading ? <p className="status">Loading expenses...</p> : null}

        {!isLoading && transactions.length === 0 ? (
          <p className="empty-state">
            No persisted transactions yet. Save an import first and they will show up here.
          </p>
        ) : null}

        {!isLoading && transactions.length > 0 && visibleTransactions.length === 0 ? (
          <p className="empty-state">
            No imported rows match the current search or filters.
          </p>
        ) : null}

        {!isLoading && visibleTransactions.length > 0 ? (
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
                {visibleTransactions.map((transaction) => (
                  <tr
                    className={
                      selectedTransactionId === transaction.id ? "table-row-active" : undefined
                    }
                    key={transaction.id}
                  >
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
                        className={`badge ${
                          transaction.classification ? "badge-neutral" : "badge-warning"
                        }`}
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
                        className={`badge ${
                          transaction.allocation?.reportingMode === "allocated_period"
                            ? "badge-warning"
                            : "badge-neutral"
                        }`}
                      >
                        {formatAllocationSummary(transaction.allocation)}
                      </span>
                    </td>
                    <td>
                      <div className="action-row">
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => setSelectedTransactionId(transaction.id)}
                        >
                          {selectedTransactionId === transaction.id ? "Selected" : "Allocation"}
                        </button>
                        <Link
                          className="link-button"
                          href={`/imports/review?transactionId=${transaction.id}`}
                        >
                          Review
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="card stack compact">
          <div>
            <h3>Adjusted-period allocation</h3>
            <p className="muted-text">
              Select a transaction above to tune which reporting months it lands in.
            </p>
          </div>

          {!selectedTransaction ? (
            <p className="helper-text">
              Pick a visible transaction row to edit its allocation here.
            </p>
          ) : !transactionAllocationEditable ? (
            <p className="helper-text">
              Save a reportable classification in the review queue before editing this
              transaction&apos;s allocation.
            </p>
          ) : (
            <AllocationEditor
              currency={selectedTransaction.workspaceCurrency}
              direction={selectedTransaction.direction}
              form={transactionAllocationForm}
              isSaving={isSavingTransactionAllocation}
              onSave={() =>
                startSavingTransactionAllocation(() =>
                  void submitAllocationUpdate({
                    sourceId: selectedTransaction.id,
                    sourceType: "transaction",
                    form: transactionAllocationForm,
                  }),
                )
              }
              setForm={setTransactionAllocationForm}
              sourceDate={selectedTransaction.transactionDate}
              totalAmount={selectedTransaction.normalizedAmount}
            />
          )}
        </div>
      </article>
    </section>
  );
}
