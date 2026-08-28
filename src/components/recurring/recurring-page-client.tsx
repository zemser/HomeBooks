"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { CurrencySelect } from "@/components/shared/currency-select";
import { Modal } from "@/components/shared/modal";
import { NormalizationModeSelect } from "@/components/recurring/normalization-mode-select";
import { CategorySelect } from "@/components/workspaces/category-select";
import { CLASSIFICATION_TYPES } from "@/features/expenses/constants";
import {
  formatClassificationTypeLabel,
  formatMoneyDisplay,
} from "@/features/expenses/presentation";
import {
  EVENT_KINDS,
  NORMALIZATION_MODE_OPTIONS,
  RECURRENCE_RULES,
  type EventKind,
  type NormalizationMode,
  type RecurrenceRule,
} from "@/features/recurring/constants";
import type { RecurringPageData } from "@/features/recurring/types";
import { currentMonthString, monthLabel } from "@/features/recurring/utils";

type RecurringResponse = RecurringPageData & {
  error?: string;
};

type RuleFormState = {
  title: string;
  eventKind: EventKind;
  payerMemberId: string;
  classificationType: (typeof CLASSIFICATION_TYPES)[number];
  category: string;
  categoryId: string;
  active: boolean;
};

type CreateRuleState = RuleFormState & {
  effectiveStartMonth: string;
  amount: string;
  currency: string;
  normalizationMode: NormalizationMode;
  recurrenceRule: RecurrenceRule;
  notes: string;
};

type VersionFormState = {
  effectiveStartMonth: string;
  amount: string;
  currency: string;
  normalizationMode: NormalizationMode;
  recurrenceRule: RecurrenceRule;
  notes: string;
};

function toMonthInputValue(value: string) {
  return value.slice(0, 7);
}

function todayMonthInputValue() {
  return toMonthInputValue(currentMonthString());
}

const initialCreateState: CreateRuleState = {
  title: "",
  eventKind: "expense",
  payerMemberId: "",
  classificationType: "household",
  category: "",
  categoryId: "",
  active: true,
  effectiveStartMonth: todayMonthInputValue(),
  amount: "",
  currency: "ILS",
  normalizationMode: "none",
  recurrenceRule: "monthly",
  notes: "",
};

const initialVersionState: VersionFormState = {
  effectiveStartMonth: todayMonthInputValue(),
  amount: "",
  currency: "ILS",
  normalizationMode: "none",
  recurrenceRule: "monthly",
  notes: "",
};

function isForeignCurrency(currency: string, workspaceCurrency: string | undefined) {
  return Boolean(workspaceCurrency) && currency !== workspaceCurrency;
}

export function RecurringPageClient({ initialData }: { initialData: RecurringPageData }) {
  const [data, setData] = useState<RecurringPageData | null>(initialData);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [createState, setCreateState] = useState<CreateRuleState>(initialCreateState);
  const [editState, setEditState] = useState<RuleFormState | null>(null);
  const [versionState, setVersionState] = useState<VersionFormState>(initialVersionState);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSavingCreate, startSavingCreate] = useTransition();
  const [isSavingEdit, startSavingEdit] = useTransition();
  const [isSavingVersion, startSavingVersion] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  async function loadPage() {
    setError(null);

    try {
      const currentMonth = currentMonthString();
      const search = new URLSearchParams({
        startMonth: currentMonth,
        endMonth: currentMonth,
      });
      const response = await fetch(`/api/recurring?${search.toString()}`);
      const payload = (await response.json()) as RecurringResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load recurring entries.");
      }

      setData(payload);
      setCreateState((current) => ({
        ...current,
        currency: payload.workspaceCurrency,
      }));
      setVersionState((current) => ({
        ...current,
        currency: current.currency || payload.workspaceCurrency,
      }));
      setSelectedEntryId((current) => {
        if (
          current &&
          payload.recurringEntries.some((entry) => entry.id === current)
        ) {
          return current;
        }

        return null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load recurring entries.",
      );
      setData(null);
      setSelectedEntryId(null);
    } finally {
      setIsLoading(false);
    }
  }

  const selectedEntry = useMemo(
    () => data?.recurringEntries.find((entry) => entry.id === selectedEntryId) ?? null,
    [data?.recurringEntries, selectedEntryId],
  );
  const hasDefinedCategories = (data?.categories.length ?? 0) > 0;
  const createUsesForeignCurrency = isForeignCurrency(
    createState.currency,
    data?.workspaceCurrency,
  );
  const versionUsesForeignCurrency = isForeignCurrency(
    versionState.currency,
    data?.workspaceCurrency,
  );

  useEffect(() => {
    if (!selectedEntry) {
      setEditState(null);
      setVersionState((current) => ({
        ...current,
        effectiveStartMonth: todayMonthInputValue(),
      }));
      return;
    }

    setEditState({
      title: selectedEntry.title,
      eventKind: selectedEntry.eventKind,
      payerMemberId: selectedEntry.payerMemberId ?? "",
      classificationType: selectedEntry.classificationType,
      category: selectedEntry.category ?? "",
      categoryId: selectedEntry.categoryId ?? "",
      active: selectedEntry.active,
    });
    setVersionState({
      effectiveStartMonth: todayMonthInputValue(),
      amount: selectedEntry.currentVersion?.amount
        ? Number(selectedEntry.currentVersion.amount).toFixed(2)
        : "",
      currency: selectedEntry.currentVersion?.currency ?? data?.workspaceCurrency ?? "ILS",
      normalizationMode: selectedEntry.currentVersion?.normalizationMode ?? "none",
      recurrenceRule:
        selectedEntry.currentVersion?.recurrenceRule === "monthly" ? "monthly" : "monthly",
      notes: selectedEntry.currentVersion?.notes ?? "",
    });
  }, [data?.workspaceCurrency, selectedEntry]);

  async function handleCreateRecurringEntry() {
    setError(null);
    setMessage(null);

    const response = await fetch("/api/recurring", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...createState,
        payerMemberId: createState.payerMemberId || null,
        category: createState.category,
        categoryId: createState.categoryId || null,
        effectiveStartMonth: `${createState.effectiveStartMonth}-01`,
        amount: Number(createState.amount),
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Could not create the recurring entry.");
      return;
    }

    await loadPage();
    setCreateState((current) => ({
      ...initialCreateState,
      currency: current.currency,
    }));
    setMessage(
      createState.effectiveStartMonth <= todayMonthInputValue()
        ? `Recurring definition saved. Applicable months through ${monthLabel(currentMonthString())} are ready for reports.`
        : `Recurring definition saved. It will start in ${monthLabel(createState.effectiveStartMonth)}.`,
    );
    setIsCreateModalOpen(false);
  }

  async function handleSaveRecurringEntry() {
    if (!selectedEntry || !editState) {
      return;
    }

    setError(null);
    setMessage(null);

    const response = await fetch(`/api/recurring/${selectedEntry.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...editState,
        payerMemberId: editState.payerMemberId || null,
        categoryId: editState.categoryId || null,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Could not update the recurring entry.");
      return;
    }

    await loadPage();
    setMessage(
      editState.active
        ? "Recurring definition updated."
        : "Recurring definition paused. Current and future recurring rows were removed from reports.",
    );
  }

  async function handleCreateVersion() {
    if (!selectedEntry) {
      return;
    }

    setError(null);
    setMessage(null);

    const response = await fetch(`/api/recurring/${selectedEntry.id}/versions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...versionState,
        effectiveStartMonth: `${versionState.effectiveStartMonth}-01`,
        amount: Number(versionState.amount),
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Could not create the future version.");
      return;
    }

    await loadPage();
    setMessage("Future change saved.");
  }

  async function handleDeleteRecurringEntry() {
    if (!selectedEntry) {
      return;
    }

    const shouldDelete = window.confirm(
      `Delete "${selectedEntry.title}" and remove its recurring rows from reports?`,
    );

    if (!shouldDelete) {
      return;
    }

    setError(null);
    setMessage(null);

    const response = await fetch(`/api/recurring/${selectedEntry.id}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Could not delete the recurring entry.");
      return;
    }

    await loadPage();
    setMessage("Recurring definition deleted.");
  }

  return (
    <section className="stack recurring-sections">
      {error ? <p className="status error">{error}</p> : null}
      {message ? <p className="status">{message}</p> : null}

      <section className="two-up">
        <Modal
          open={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title="Add recurring rule"
          description="Create a regular income or expense for future reports."
        >
        <article className="stack compact">
          <div className="stack compact">
            <label className="field">
              <span>Title</span>
              <input
                className="input"
                value={createState.title}
                onChange={(event) =>
                  setCreateState((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>

            <div className="inline-form">
              <label className="field">
                <span>Kind</span>
                <select
                  className="input"
                  value={createState.eventKind}
                  onChange={(event) =>
                    setCreateState((current) => ({
                      ...current,
                      eventKind: event.target.value as EventKind,
                    }))
                  }
                >
                  {EVENT_KINDS.map((kind) => (
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
                  value={createState.classificationType}
                  onChange={(event) =>
                    setCreateState((current) => ({
                      ...current,
                      classificationType: event.target.value as (typeof CLASSIFICATION_TYPES)[number],
                    }))
                  }
                >
                  {CLASSIFICATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {formatClassificationTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Payer</span>
                <select
                  className="input"
                  value={createState.payerMemberId}
                  onChange={(event) =>
                    setCreateState((current) => ({
                      ...current,
                      payerMemberId: event.target.value,
                    }))
                  }
                >
                  <option value="">Unassigned</option>
                  {data?.members.map((member) => (
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
                <CategorySelect
                  categories={data?.categoryCatalog ?? []}
                  categoryId={createState.categoryId}
                  categoryName={createState.category}
                  onChange={(categoryId, category) =>
                    setCreateState((current) => ({ ...current, category, categoryId }))
                  }
                  blankLabel="Uncategorized"
                />
              </label>

              <label className="field">
                <span>Effective month</span>
                <input
                  className="input"
                  type="month"
                  value={createState.effectiveStartMonth}
                  onChange={(event) =>
                    setCreateState((current) => ({
                      ...current,
                      effectiveStartMonth: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="field">
                <span>Amount</span>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={createState.amount}
                  onChange={(event) =>
                    setCreateState((current) => ({ ...current, amount: event.target.value }))
                  }
                />
              </label>

              <label className="field">
                <span>Currency</span>
                <CurrencySelect
                  value={createState.currency}
                  workspaceCurrency={data?.workspaceCurrency ?? createState.currency}
                  onChange={(currency) =>
                    setCreateState((current) => ({
                      ...current,
                      currency,
                      normalizationMode:
                        currency === data?.workspaceCurrency
                          ? "none"
                          : current.normalizationMode,
                    }))
                  }
                />
              </label>
            </div>

            {!hasDefinedCategories ? (
              <p className="helper-text">
                Add categories in settings before assigning one to recurring rules.
              </p>
            ) : null}

            <div className="inline-form">
              {createUsesForeignCurrency ? (
                <NormalizationModeSelect
                  value={createState.normalizationMode}
                  onChange={(normalizationMode) =>
                    setCreateState((current) => ({ ...current, normalizationMode }))
                  }
                />
              ) : null}

              <label className="field">
                <span>Recurrence</span>
                <select
                  className="input"
                  value={createState.recurrenceRule}
                  onChange={(event) =>
                    setCreateState((current) => ({
                      ...current,
                      recurrenceRule: event.target.value as RecurrenceRule,
                    }))
                  }
                >
                  {RECURRENCE_RULES.map((rule) => (
                    <option key={rule} value={rule}>
                      {rule}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Notes</span>
                <input
                  className="input"
                  value={createState.notes}
                  onChange={(event) =>
                    setCreateState((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
            </div>

            <button
              className="button"
              type="button"
              disabled={isSavingCreate}
              onClick={() => startSavingCreate(() => void handleCreateRecurringEntry())}
            >
              {isSavingCreate ? "Saving..." : "Save recurring definition"}
            </button>
          </div>
        </article>
        </Modal>

        <article className="card recurring-generated-section">
          <h2>This month</h2>
          <p className="muted-text">
            A compact preview of what recurring rules add to this month&apos;s reports.
          </p>
          <div className="stack compact">
            <div className="stack compact">
              <h3>{monthLabel(currentMonthString())} entries</h3>
              {data?.generatedEntries.length ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Title</th>
                        <th>Kind</th>
                        <th>Amount</th>
                        <th>Classification</th>
                        <th>Payer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.generatedEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td>{monthLabel(entry.eventDate)}</td>
                          <td>{entry.title}</td>
                          <td>{entry.eventKind}</td>
                          <td>
                            {formatMoneyDisplay(
                              entry.normalizedAmount,
                              entry.workspaceCurrency,
                            )}
                          </td>
                          <td>
                            {formatClassificationTypeLabel(entry.classificationType)}
                            {entry.category ? (
                              <div className="table-note">{entry.category}</div>
                            ) : null}
                          </td>
                          <td>{entry.payerMemberName ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state">
                  No recurring rows are active for {monthLabel(currentMonthString())} yet.
                </p>
              )}
            </div>
          </div>
        </article>
      </section>

      <section className="recurring-layout">
        <article className="card">
          <div className="page-actions recurring-list-header">
            <button className="button" type="button" onClick={() => setIsCreateModalOpen(true)}>
              Add recurring rule
            </button>
          </div>
          {isLoading ? <p className="status">Loading recurring entries...</p> : null}
          {!isLoading && !data?.recurringEntries.length ? (
            <p className="empty-state">
              No recurring rules exist yet. Create the first rent, salary, or recurring
              household item above.
            </p>
          ) : null}

          <div className="stack compact">
            {data?.recurringEntries.map((entry) => (
              <button
                className={`selector-card ${selectedEntryId === entry.id ? "selector-card-active" : ""}`}
                key={entry.id}
                type="button"
                onClick={() => {
                  setSelectedEntryId(entry.id);
                  setIsEditModalOpen(true);
                }}
              >
                <div className="selector-card-header">
                  <strong>{entry.title}</strong>
                  <span className={`badge ${entry.active ? "badge-neutral" : "badge-warning"}`}>
                    {entry.active ? "Active" : "Paused"}
                  </span>
                </div>
                <p className="table-note">
                  {entry.eventKind} / {formatClassificationTypeLabel(entry.classificationType)}
                  {entry.category ? ` / ${entry.category}` : ""}
                </p>
                {entry.currentVersion ? (
                  <p className="table-note">
                    Current:{" "}
                    {formatMoneyDisplay(
                      entry.currentVersion.amount,
                      entry.currentVersion.currency,
                    )}{" "}
                    from {monthLabel(entry.currentVersion.effectiveStartMonth)}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        </article>

        <Modal
          open={isEditModalOpen && Boolean(selectedEntry && editState)}
          onClose={() => setIsEditModalOpen(false)}
          size="wide"
          title={selectedEntry ? `Edit ${selectedEntry.title}` : "Edit recurring rule"}
          description="Update the rule or schedule a future change."
        >
        <article className="stack compact">
          {!selectedEntry || !editState ? (
            <p className="empty-state">Select a recurring rule to edit it.</p>
          ) : (
            <div className="stack">
              <div className="stack compact">
                <h3>Definition</h3>
                <p className="muted-text">
                  Edit the recurring definition here. Effective months live in the version
                  history below, while the active toggle removes current and future report rows without
                  deleting the rule.
                </p>
                <label className="field">
                  <span>Title</span>
                  <input
                    className="input"
                    value={editState.title}
                    onChange={(event) =>
                      setEditState((current) =>
                        current ? { ...current, title: event.target.value } : current,
                      )
                    }
                  />
                </label>

                <div className="inline-form">
                  <label className="field">
                    <span>Kind</span>
                    <select
                      className="input"
                      value={editState.eventKind}
                      onChange={(event) =>
                        setEditState((current) =>
                          current
                            ? { ...current, eventKind: event.target.value as EventKind }
                            : current,
                        )
                      }
                    >
                      {EVENT_KINDS.map((kind) => (
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
                      value={editState.classificationType}
                      onChange={(event) =>
                        setEditState((current) =>
                          current
                            ? {
                                ...current,
                                classificationType:
                                  event.target.value as (typeof CLASSIFICATION_TYPES)[number],
                              }
                            : current,
                        )
                      }
                    >
                      {CLASSIFICATION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {formatClassificationTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Payer</span>
                    <select
                      className="input"
                      value={editState.payerMemberId}
                      onChange={(event) =>
                        setEditState((current) =>
                          current
                            ? { ...current, payerMemberId: event.target.value }
                            : current,
                        )
                      }
                    >
                      <option value="">Unassigned</option>
                      {data?.members.map((member) => (
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
                    <CategorySelect
                      categories={data?.categoryCatalog ?? []}
                      categoryId={editState.categoryId}
                      categoryName={editState.category}
                      onChange={(categoryId, category) =>
                        setEditState((current) =>
                          current ? { ...current, category, categoryId } : current,
                        )
                      }
                      blankLabel="Uncategorized"
                    />
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={editState.active}
                      onChange={(event) =>
                        setEditState((current) =>
                          current ? { ...current, active: event.target.checked } : current,
                        )
                      }
                    />
                    <span>Rule is active in reports</span>
                  </label>
                </div>

                <div className="action-row">
                  <button
                    className="button"
                    type="button"
                    disabled={isSavingEdit}
                    onClick={() => startSavingEdit(() => void handleSaveRecurringEntry())}
                  >
                    {isSavingEdit ? "Saving..." : "Save recurring definition"}
                  </button>
                  <button
                    className="button button-danger"
                    type="button"
                    disabled={isDeleting}
                    onClick={() => startDeleting(() => void handleDeleteRecurringEntry())}
                  >
                    {isDeleting ? "Deleting..." : "Delete definition"}
                  </button>
                </div>
              </div>

              <details className="disclosure">
                <summary>Schedule a future change</summary>
                <div className="stack compact">
                  <p className="muted-text">
                    Use a new effective month when rent, salary, or another recurring amount
                    changes. Existing prepared months stay unchanged.
                  </p>
                <div className="inline-form">
                  <label className="field">
                    <span>Effective month</span>
                    <input
                      className="input"
                      type="month"
                      value={versionState.effectiveStartMonth}
                      onChange={(event) =>
                        setVersionState((current) => ({
                          ...current,
                          effectiveStartMonth: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Amount</span>
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      min="0"
                      value={versionState.amount}
                      onChange={(event) =>
                        setVersionState((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Currency</span>
                    <CurrencySelect
                      value={versionState.currency}
                      workspaceCurrency={data?.workspaceCurrency ?? versionState.currency}
                      onChange={(currency) =>
                        setVersionState((current) => ({
                          ...current,
                          currency,
                          normalizationMode:
                            currency === data?.workspaceCurrency
                              ? "none"
                              : current.normalizationMode,
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="inline-form">
                  {versionUsesForeignCurrency ? (
                    <NormalizationModeSelect
                      value={versionState.normalizationMode}
                      onChange={(normalizationMode) =>
                        setVersionState((current) => ({ ...current, normalizationMode }))
                      }
                    />
                  ) : null}

                  <label className="field">
                    <span>Recurrence</span>
                    <select
                      className="input"
                      value={versionState.recurrenceRule}
                      onChange={(event) =>
                        setVersionState((current) => ({
                          ...current,
                          recurrenceRule: event.target.value as RecurrenceRule,
                        }))
                      }
                    >
                      {RECURRENCE_RULES.map((rule) => (
                        <option key={rule} value={rule}>
                          {rule}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Notes</span>
                    <input
                      className="input"
                      value={versionState.notes}
                      onChange={(event) =>
                        setVersionState((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <button
                  className="button"
                  type="button"
                  disabled={isSavingVersion}
                  onClick={() => startSavingVersion(() => void handleCreateVersion())}
                >
                  {isSavingVersion ? "Saving..." : "Add future version"}
                </button>
                </div>
              </details>

              <div className="stack compact">
                <h3>Version history</h3>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Start</th>
                        <th>End</th>
                        <th>Amount</th>
                        <th>Mode</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEntry.versions.map((version) => (
                        <tr key={version.id}>
                          <td>{monthLabel(version.effectiveStartMonth)}</td>
                          <td>
                            {version.effectiveEndMonth
                              ? monthLabel(version.effectiveEndMonth)
                              : "Open"}
                          </td>
                          <td>{formatMoneyDisplay(version.amount, version.currency)}</td>
                          <td>
                            {version.currency === data?.workspaceCurrency
                              ? "Not needed"
                              : NORMALIZATION_MODE_OPTIONS.find(
                                  (option) => option.value === version.normalizationMode,
                                )?.label ?? version.normalizationMode}
                          </td>
                          <td>{version.notes ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </article>
        </Modal>
      </section>
    </section>
  );
}
