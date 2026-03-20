"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { CLASSIFICATION_TYPES } from "@/features/expenses/constants";
import {
  formatClassificationTypeLabel,
  formatMoneyDisplay,
} from "@/features/expenses/presentation";
import {
  EVENT_KINDS,
  NORMALIZATION_MODES,
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

export function RecurringPageClient() {
  const [data, setData] = useState<RecurringPageData | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [createState, setCreateState] = useState<CreateRuleState>(initialCreateState);
  const [editState, setEditState] = useState<RuleFormState | null>(null);
  const [versionState, setVersionState] = useState<VersionFormState>(initialVersionState);
  const [generationRange, setGenerationRange] = useState({
    startMonth: todayMonthInputValue(),
    endMonth: todayMonthInputValue(),
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCreate, startSavingCreate] = useTransition();
  const [isSavingEdit, startSavingEdit] = useTransition();
  const [isSavingVersion, startSavingVersion] = useTransition();
  const [isGenerating, startGenerating] = useTransition();

  async function loadPage(range = generationRange) {
    setError(null);

    try {
      const search = new URLSearchParams({
        startMonth: `${range.startMonth}-01`,
        endMonth: `${range.endMonth}-01`,
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

        return payload.recurringEntries[0]?.id ?? null;
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

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedEntry = useMemo(
    () => data?.recurringEntries.find((entry) => entry.id === selectedEntryId) ?? null,
    [data?.recurringEntries, selectedEntryId],
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
    setMessage("Recurring entry created.");
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
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Could not update the recurring entry.");
      return;
    }

    await loadPage();
    setMessage("Recurring entry updated.");
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
    setMessage("Future version saved.");
  }

  async function handleGenerateEntries() {
    setError(null);
    setMessage(null);

    const response = await fetch("/api/recurring/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startMonth: `${generationRange.startMonth}-01`,
        endMonth: `${generationRange.endMonth}-01`,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      createdCount?: number;
    };

    if (!response.ok) {
      setError(payload.error ?? "Could not generate manual entries.");
      return;
    }

    await loadPage(generationRange);
    setMessage(
      payload.createdCount
        ? `Generated ${payload.createdCount} recurring manual entries.`
        : "No new recurring entries were generated for that range.",
    );
  }

  return (
    <section className="stack">
      {error ? <p className="status error">{error}</p> : null}
      {message ? <p className="status">{message}</p> : null}

      <section className="two-up">
        <article className="card">
          <h2>Create recurring rule</h2>
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
                <input
                  className="input"
                  value={createState.category}
                  onChange={(event) =>
                    setCreateState((current) => ({ ...current, category: event.target.value }))
                  }
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
                <input
                  className="input"
                  value={createState.currency}
                  onChange={(event) =>
                    setCreateState((current) => ({
                      ...current,
                      currency: event.target.value.toUpperCase(),
                    }))
                  }
                />
              </label>
            </div>

            <div className="inline-form">
              <label className="field">
                <span>Normalization mode</span>
                <select
                  className="input"
                  value={createState.normalizationMode}
                  onChange={(event) =>
                    setCreateState((current) => ({
                      ...current,
                      normalizationMode: event.target.value as NormalizationMode,
                    }))
                  }
                >
                  {NORMALIZATION_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </label>

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
              {isSavingCreate ? "Saving..." : "Create recurring rule"}
            </button>
          </div>
        </article>

        <article className="card">
          <h2>Generate manual entries</h2>
          <p className="muted-text">
            Generation is idempotent for this slice. Existing generated rows are preserved,
            and new future versions only affect months that have not been generated yet.
          </p>
          <div className="stack compact">
            <div className="inline-form">
              <label className="field">
                <span>Start month</span>
                <input
                  className="input"
                  type="month"
                  value={generationRange.startMonth}
                  onChange={(event) =>
                    setGenerationRange((current) => ({
                      ...current,
                      startMonth: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>End month</span>
                <input
                  className="input"
                  type="month"
                  value={generationRange.endMonth}
                  onChange={(event) =>
                    setGenerationRange((current) => ({
                      ...current,
                      endMonth: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <button
              className="button"
              type="button"
              disabled={isGenerating}
              onClick={() => startGenerating(() => void handleGenerateEntries())}
            >
              {isGenerating ? "Generating..." : "Generate entries for range"}
            </button>

            <div className="stack compact">
              <h3>Generated entries in range</h3>
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
                  No generated recurring entries are stored for the selected range yet.
                </p>
              )}
            </div>
          </div>
        </article>
      </section>

      <section className="recurring-layout">
        <article className="card">
          <h2>Recurring rules</h2>
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
                onClick={() => setSelectedEntryId(entry.id)}
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

        <article className="card">
          <h2>Selected rule details</h2>
          {!selectedEntry || !editState ? (
            <p className="empty-state">Select a recurring rule to edit it.</p>
          ) : (
            <div className="stack">
              <div className="stack compact">
                <h3>Rule metadata</h3>
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
                    <input
                      className="input"
                      value={editState.category}
                      onChange={(event) =>
                        setEditState((current) =>
                          current ? { ...current, category: event.target.value } : current,
                        )
                      }
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
                    <span>Rule is active</span>
                  </label>
                </div>

                <button
                  className="button"
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => startSavingEdit(() => void handleSaveRecurringEntry())}
                >
                  {isSavingEdit ? "Saving..." : "Save rule metadata"}
                </button>
              </div>

              <div className="stack compact">
                <h3>Add future version</h3>
                <p className="muted-text">
                  Use a new effective month when rent, salary, or another recurring amount
                  changes. Existing generated months stay unchanged.
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
                    <input
                      className="input"
                      value={versionState.currency}
                      onChange={(event) =>
                        setVersionState((current) => ({
                          ...current,
                          currency: event.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="inline-form">
                  <label className="field">
                    <span>Normalization mode</span>
                    <select
                      className="input"
                      value={versionState.normalizationMode}
                      onChange={(event) =>
                        setVersionState((current) => ({
                          ...current,
                          normalizationMode: event.target.value as NormalizationMode,
                        }))
                      }
                    >
                      {NORMALIZATION_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </label>

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
                          <td>{version.normalizationMode}</td>
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
      </section>
    </section>
  );
}
