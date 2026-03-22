"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

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

export function ExpensesPageClient() {
  const [transactions, setTransactions] = useState<ExpenseTransactionItem[]>([]);
  const [oneTimeManualEntries, setOneTimeManualEntries] = useState<OneTimeManualEntryItem[]>(
    [],
  );
  const [members, setMembers] = useState<WorkspaceMemberOption[]>([]);
  const [selectedManualEntryId, setSelectedManualEntryId] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [manualEntryForm, setManualEntryForm] = useState<ManualEntryFormState>(
    createInitialManualEntryFormState(),
  );
  const [manualEntryAllocationForm, setManualEntryAllocationForm] =
    useState<AllocationFormState>(emptyAllocationForm);
  const [transactionAllocationForm, setTransactionAllocationForm] =
    useState<AllocationFormState>(emptyAllocationForm);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isSavingManualEntry, startSavingManualEntry] = useTransition();
  const [isDeletingManualEntry, startDeletingManualEntry] = useTransition();
  const [isSavingManualAllocation, startSavingManualAllocation] = useTransition();
  const [isSavingTransactionAllocation, startSavingTransactionAllocation] = useTransition();

  async function loadExpenses(options?: LoadExpensesOptions) {
    setError(null);

    try {
      const response = await fetch("/api/expenses");
      const data = (await response.json()) as ExpensesResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Could not load expenses.");
      }

      const nextTransactions = data.transactions ?? [];
      const nextOneTimeManualEntries = data.oneTimeManualEntries ?? [];
      const nextMembers = data.members ?? [];

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
    void loadExpenses();
  }, []);

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

  function startNewManualEntry() {
    setSelectedManualEntryId(null);
    setManualEntryForm(createInitialManualEntryFormState());
    setManualEntryAllocationForm(emptyAllocationForm);
    setError(null);
    setMessage(null);
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
            <strong>{oneTimeManualEntries.length}</strong>
            <span>One-time manual entries</span>
          </div>
          <div>
            <strong>{reviewCount}</strong>
            <span>Still need review</span>
          </div>
        </div>
      </article>

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
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {oneTimeManualEntries.map((entry) => (
                    <tr
                      className={
                        selectedManualEntryId === entry.id ? "table-row-active" : undefined
                      }
                      key={entry.id}
                    >
                      <td>{entry.eventDate}</td>
                      <td>
                        <strong>{entry.title}</strong>
                        <div className="table-note">{entry.payerMemberName ?? "Unassigned"}</div>
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
                          className={`badge ${entry.allocation?.reportingMode === "allocated_period" ? "badge-warning" : "badge-neutral"}`}
                        >
                          {formatAllocationSummary(entry.allocation)}
                        </span>
                      </td>
                      <td>
                        <div className="action-row">
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => setSelectedManualEntryId(entry.id)}
                          >
                            {selectedManualEntryId === entry.id ? "Editing" : "Edit"}
                          </button>
                          <button
                            className="link-button"
                            disabled={isDeletingManualEntry && pendingDeleteId === entry.id}
                            type="button"
                            onClick={() =>
                              startDeletingManualEntry(() => {
                                void deleteManualEntry(entry.id);
                              })
                            }
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
          <Link className="button" href="/imports/review">
            Open review queue
          </Link>
        </div>

        {isLoading ? <p className="status">Loading expenses...</p> : null}

        {!isLoading && transactions.length === 0 ? (
          <p className="empty-state">
            No persisted transactions yet. Save an import first and they will show up here.
          </p>
        ) : null}

        {!isLoading && transactions.length > 0 ? (
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
              Pick a transaction row to edit its allocation here.
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
