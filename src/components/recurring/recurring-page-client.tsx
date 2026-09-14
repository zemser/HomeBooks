"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { CurrencyInput } from "@/components/shared/currency-input";
import { Modal } from "@/components/shared/modal";
import { NormalizationModeSelect } from "@/components/recurring/normalization-mode-select";
import { CategorySelect } from "@/components/workspaces/category-select";
import {
  MemberAttributionFields,
  memberAttributionForClassificationType,
  SplitForSettlementField,
} from "@/components/expenses/member-attribution-fields";
import { CLASSIFICATION_TYPES } from "@/features/expenses/constants";
import {
  classificationsForEventKind,
  normalizeClassificationForEventKind,
} from "@/features/expenses/payer";
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
import type {
  RecurringEntryItem,
  RecurringEntryVersionItem,
  RecurringPageData,
} from "@/features/recurring/types";
import {
  currentMonthString,
  monthLabel,
  nextMonthString,
  previousMonthString,
} from "@/features/recurring/utils";

type RecurringResponse = RecurringPageData & {
  error?: string;
};

type RuleFormState = {
  title: string;
  eventKind: EventKind;
  personalOwnerMemberId: string;
  payerMemberId: string;
  receivedByMemberId: string;
  classificationType: (typeof CLASSIFICATION_TYPES)[number];
  splitForSettlement: boolean;
  category: string;
  categoryId: string;
  active: boolean;
  startsMonth: string;
};

type CreateRuleState = {
  title: string;
  eventKind: EventKind;
  personalOwnerMemberId: string;
  payerMemberId: string;
  receivedByMemberId: string;
  classificationType: (typeof CLASSIFICATION_TYPES)[number];
  splitForSettlement: boolean;
  category: string;
  categoryId: string;
  active: boolean;
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

function nextMonthInputValue() {
  return toMonthInputValue(nextMonthString());
}

function versionsByStart(entry: RecurringEntryItem) {
  return [...entry.versions].sort((left, right) =>
    left.effectiveStartMonth.localeCompare(right.effectiveStartMonth),
  );
}

function openingVersionOf(entry: RecurringEntryItem) {
  return versionsByStart(entry)[0] ?? null;
}

function nextAmountVersionOf(entry: RecurringEntryItem) {
  return versionsByStart(entry)[1] ?? null;
}

function canRemoveAmountChange(entry: RecurringEntryItem, version: RecurringEntryVersionItem) {
  return (
    versionsByStart(entry).length > 1 && version.effectiveStartMonth > currentMonthString()
  );
}

function versionCoverageLabel(version: RecurringEntryVersionItem) {
  const from = monthLabel(version.effectiveStartMonth);
  const until = version.effectiveEndMonth
    ? monthLabel(version.effectiveEndMonth)
    : monthLabel(currentMonthString());

  return from === until ? from : `${from}–${until}`;
}

function versionToFormState(
  version: RecurringEntryVersionItem,
  workspaceCurrency: string,
): VersionFormState {
  return {
    effectiveStartMonth: toMonthInputValue(version.effectiveStartMonth),
    amount: Number(version.amount).toFixed(2),
    currency: version.currency || workspaceCurrency,
    normalizationMode: version.normalizationMode,
    recurrenceRule: "monthly",
    notes: version.notes ?? "",
  };
}

function recurringCardAmountLine(entry: RecurringEntryItem) {
  const currentVersion = entry.currentVersion;

  if (!currentVersion) {
    return null;
  }

  const amount = formatMoneyDisplay(currentVersion.amount, currentVersion.currency);
  const openingVersion = openingVersionOf(entry);
  const openingMonth = openingVersion?.effectiveStartMonth ?? currentVersion.effectiveStartMonth;

  if (openingVersion && openingVersion.id !== currentVersion.id) {
    return `${amount} from ${monthLabel(currentVersion.effectiveStartMonth)} · started ${monthLabel(openingMonth)}`;
  }

  return `${amount} starting ${monthLabel(openingMonth)}`;
}

const initialCreateState: CreateRuleState = {
  title: "",
  eventKind: "expense",
  personalOwnerMemberId: "",
  payerMemberId: "",
  receivedByMemberId: "",
  classificationType: "shared",
  splitForSettlement: false,
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
  effectiveStartMonth: nextMonthInputValue(),
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
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [versionEditState, setVersionEditState] = useState<VersionFormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSavingCreate, startSavingCreate] = useTransition();
  const [isSavingEdit, startSavingEdit] = useTransition();
  const [isSavingVersion, startSavingVersion] = useTransition();
  const [isSavingVersionEdit, startSavingVersionEdit] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [isDeletingVersion, startDeletingVersion] = useTransition();

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
  const versionEditUsesForeignCurrency = isForeignCurrency(
    versionEditState?.currency ?? "",
    data?.workspaceCurrency,
  );
  const openingVersion = selectedEntry ? openingVersionOf(selectedEntry) : null;
  const nextAmountVersion = selectedEntry ? nextAmountVersionOf(selectedEntry) : null;
  const latestAllowedStartMonth = nextAmountVersion
    ? toMonthInputValue(previousMonthString(nextAmountVersion.effectiveStartMonth))
    : undefined;
  const createClassificationOptions = classificationsForEventKind(
    createState.eventKind,
    CLASSIFICATION_TYPES,
  );
  const editClassificationOptions = editState
    ? classificationsForEventKind(editState.eventKind, CLASSIFICATION_TYPES)
    : [];

  useEffect(() => {
    if (!selectedEntry) {
      setEditState(null);
      setEditingVersionId(null);
      setVersionEditState(null);
      setVersionState((current) => ({
        ...current,
        effectiveStartMonth: nextMonthInputValue(),
      }));
      return;
    }

    const classificationType = normalizeClassificationForEventKind(
      selectedEntry.eventKind,
      selectedEntry.classificationType,
    );
    const openingVersion = openingVersionOf(selectedEntry);

    setEditState({
      title: selectedEntry.title,
      eventKind: selectedEntry.eventKind,
      personalOwnerMemberId: selectedEntry.personalOwnerMemberId ?? "",
      payerMemberId: selectedEntry.payerMemberId ?? "",
      receivedByMemberId: selectedEntry.receivedByMemberId ?? "",
      classificationType,
      splitForSettlement: Boolean(selectedEntry.splitForSettlement),
      category: selectedEntry.category ?? "",
      categoryId: selectedEntry.categoryId ?? "",
      active: selectedEntry.active,
      startsMonth: openingVersion
        ? toMonthInputValue(openingVersion.effectiveStartMonth)
        : todayMonthInputValue(),
    });
    setVersionState({
      effectiveStartMonth: nextMonthInputValue(),
      amount: selectedEntry.currentVersion?.amount
        ? Number(selectedEntry.currentVersion.amount).toFixed(2)
        : "",
      currency: selectedEntry.currentVersion?.currency ?? data?.workspaceCurrency ?? "ILS",
      normalizationMode: selectedEntry.currentVersion?.normalizationMode ?? "none",
      recurrenceRule: "monthly",
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
        personalOwnerMemberId: createState.personalOwnerMemberId || null,
        payerMemberId: createState.payerMemberId || null,
        receivedByMemberId: createState.receivedByMemberId || null,
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

    const previousStartMonth = openingVersion
      ? toMonthInputValue(openingVersion.effectiveStartMonth)
      : "";
    const startChanged = editState.startsMonth !== previousStartMonth;
    const startMovedLater = startChanged && editState.startsMonth > previousStartMonth;

    if (startMovedLater) {
      const shouldContinue = window.confirm(
        `Moving Starts later takes months before ${monthLabel(editState.startsMonth)} out of reports. Continue?`,
      );

      if (!shouldContinue) {
        return;
      }
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
        personalOwnerMemberId: editState.personalOwnerMemberId || null,
        payerMemberId: editState.payerMemberId || null,
        receivedByMemberId: editState.receivedByMemberId || null,
        categoryId: editState.categoryId || null,
        effectiveStartMonth: `${editState.startsMonth}-01`,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Could not update the recurring entry.");
      return;
    }

    await loadPage();
    setIsEditModalOpen(false);
    setMessage(
      !editState.active
        ? "Rule paused. Current and future months were removed from reports."
        : startChanged
          ? `Rule updated. It now starts in ${monthLabel(editState.startsMonth)}.`
          : "Rule updated.",
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
    setMessage(
      `Amount change saved. From ${monthLabel(versionState.effectiveStartMonth)} onward, reports will use the new amount.`,
    );
  }

  async function handleUpdateVersion() {
    if (!selectedEntry || !editingVersionId || !versionEditState) {
      return;
    }

    const version = selectedEntry.versions.find((candidate) => candidate.id === editingVersionId);

    if (!version) {
      return;
    }

    if (version.effectiveStartMonth < currentMonthString()) {
      const shouldContinue = window.confirm(
        `This will update ${versionCoverageLabel(version)} in reports. Continue?`,
      );

      if (!shouldContinue) {
        return;
      }
    }

    setError(null);
    setMessage(null);

    const response = await fetch(
      `/api/recurring/${selectedEntry.id}/versions/${editingVersionId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Number(versionEditState.amount),
          currency: versionEditState.currency,
          normalizationMode: versionEditState.normalizationMode,
          notes: versionEditState.notes,
        }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Could not update that amount.");
      return;
    }

    setEditingVersionId(null);
    setVersionEditState(null);
    await loadPage();
    setMessage(`Amount updated for ${versionCoverageLabel(version)}.`);
  }

  async function handleDeleteVersion(version: RecurringEntryVersionItem) {
    if (!selectedEntry) {
      return;
    }

    const shouldDelete = window.confirm(
      `Remove the ${formatMoneyDisplay(version.amount, version.currency)} change from ${monthLabel(version.effectiveStartMonth)}? Reports will keep the previous amount.`,
    );

    if (!shouldDelete) {
      return;
    }

    setError(null);
    setMessage(null);

    const response = await fetch(
      `/api/recurring/${selectedEntry.id}/versions/${version.id}`,
      {
        method: "DELETE",
      },
    );
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Could not remove that amount change.");
      return;
    }

    if (editingVersionId === version.id) {
      setEditingVersionId(null);
      setVersionEditState(null);
    }

    await loadPage();
    setMessage(
      `Amount change removed. From ${monthLabel(version.effectiveStartMonth)} onward, reports use the previous amount.`,
    );
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
    setMessage("Rule deleted.");
  }

  return (
    <section className="stack recurring-sections">
      {error ? <p className="status error" aria-live="assertive">{error}</p> : null}
      {message ? <p className="status success" aria-live="polite">{message}</p> : null}

      <section className="two-up">
        <Modal
          open={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title="Add recurring rule"
          description="Rent, salary, or anything that repeats every month. It will show in reports from the starting month on."
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
                  onChange={(event) => {
                    const eventKind = event.target.value as EventKind;
                    setCreateState((current) => ({
                      ...current,
                      eventKind,
                      classificationType:
                        eventKind === "income"
                          ? "income"
                          : current.classificationType === "income"
                            ? "shared"
                            : current.classificationType,
                      personalOwnerMemberId:
                        eventKind === "income" ? "" : current.personalOwnerMemberId,
                      payerMemberId:
                        eventKind === "income" ? "" : current.payerMemberId,
                      receivedByMemberId:
                        eventKind === "income" ? current.receivedByMemberId : "",
                      splitForSettlement:
                        eventKind === "income" ? false : current.splitForSettlement,
                    }));
                  }}
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
                  onChange={(event) => {
                    const classificationType = event.target
                      .value as (typeof CLASSIFICATION_TYPES)[number];
                    const nextAttribution = memberAttributionForClassificationType(
                      classificationType,
                      {
                        personalOwnerMemberId: createState.personalOwnerMemberId,
                        paidByMemberId: createState.payerMemberId,
                        receivedByMemberId: createState.receivedByMemberId,
                      },
                    );
                    setCreateState((current) => ({
                      ...current,
                      classificationType,
                      personalOwnerMemberId: nextAttribution.personalOwnerMemberId,
                      payerMemberId: nextAttribution.paidByMemberId,
                      receivedByMemberId: nextAttribution.receivedByMemberId,
                      splitForSettlement:
                        classificationType === "shared" ? current.splitForSettlement : false,
                    }));
                  }}
                >
                  {createClassificationOptions.map((type) => (
                    <option key={type} value={type}>
                      {formatClassificationTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>

              <MemberAttributionFields
                classificationType={createState.classificationType}
                value={{
                  personalOwnerMemberId: createState.personalOwnerMemberId,
                  paidByMemberId: createState.payerMemberId,
                  receivedByMemberId: createState.receivedByMemberId,
                }}
                members={data?.members ?? []}
                onChange={(next) =>
                  setCreateState((current) => ({
                    ...current,
                    personalOwnerMemberId: next.personalOwnerMemberId,
                    payerMemberId: next.paidByMemberId,
                    receivedByMemberId: next.receivedByMemberId,
                  }))
                }
              />
              <SplitForSettlementField
                classificationType={createState.classificationType}
                value={createState.splitForSettlement}
                canSplit={(data?.members.length ?? 0) >= 2}
                onChange={(splitForSettlement) =>
                  setCreateState((current) => ({ ...current, splitForSettlement }))
                }
              />
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
                <span>Starts</span>
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
                <CurrencyInput
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
            <p className="field-hint">Included in reports from this month onward.</p>

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
              {isSavingCreate ? "Saving..." : "Save rule"}
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
              No recurring rules exist yet. Create the first rent, salary, or repeating
              shared item above.
            </p>
          ) : null}

          <div className="stack compact">
            {data?.recurringEntries.map((entry) => {
              const amountLine = recurringCardAmountLine(entry);

              return (
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
                  {amountLine ? <p className="table-note">{amountLine}</p> : null}
                </button>
              );
            })}
          </div>
        </article>

        <Modal
          open={isEditModalOpen && Boolean(selectedEntry && editState)}
          onClose={() => setIsEditModalOpen(false)}
          size="wide"
          title={selectedEntry ? `Edit ${selectedEntry.title}` : "Edit recurring rule"}
          description="Change the name or starting month. Fix amounts in Amount history. If the price changes later, add that below."
        >
        <article className="stack compact">
          {!selectedEntry || !editState ? (
            <p className="empty-state">Select a recurring rule to edit it.</p>
          ) : (
            <div className="stack">
              <div className="stack compact">
                <h3>This rule</h3>
                <p className="muted-text">
                  Pause the rule to take it out of reports without deleting it.
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
                      onChange={(event) => {
                        const eventKind = event.target.value as EventKind;
                        setEditState((current) =>
                          current
                            ? {
                                ...current,
                                eventKind,
                                classificationType:
                                  eventKind === "income"
                                    ? "income"
                                    : current.classificationType === "income"
                                      ? "shared"
                                      : current.classificationType,
                                personalOwnerMemberId:
                                  eventKind === "income" ? "" : current.personalOwnerMemberId,
                                payerMemberId:
                                  eventKind === "income" ? "" : current.payerMemberId,
                                receivedByMemberId:
                                  eventKind === "income" ? current.receivedByMemberId : "",
                                splitForSettlement:
                                  eventKind === "income" ? false : current.splitForSettlement,
                              }
                            : current,
                        );
                      }}
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
                      onChange={(event) => {
                        const classificationType = event.target
                          .value as (typeof CLASSIFICATION_TYPES)[number];
                        setEditState((current) => {
                          if (!current) {
                            return current;
                          }
                          const nextAttribution = memberAttributionForClassificationType(
                            classificationType,
                            {
                              personalOwnerMemberId: current.personalOwnerMemberId,
                              paidByMemberId: current.payerMemberId,
                              receivedByMemberId: current.receivedByMemberId,
                            },
                          );
                          return {
                            ...current,
                            classificationType,
                            personalOwnerMemberId: nextAttribution.personalOwnerMemberId,
                            payerMemberId: nextAttribution.paidByMemberId,
                            receivedByMemberId: nextAttribution.receivedByMemberId,
                            splitForSettlement:
                              classificationType === "shared" ? current.splitForSettlement : false,
                          };
                        });
                      }}
                    >
                      {editClassificationOptions.map((type) => (
                        <option key={type} value={type}>
                          {formatClassificationTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <MemberAttributionFields
                    classificationType={editState.classificationType}
                    value={{
                      personalOwnerMemberId: editState.personalOwnerMemberId,
                      paidByMemberId: editState.payerMemberId,
                      receivedByMemberId: editState.receivedByMemberId,
                    }}
                    members={data?.members ?? []}
                    onChange={(next) =>
                      setEditState((current) =>
                        current
                          ? {
                              ...current,
                              personalOwnerMemberId: next.personalOwnerMemberId,
                              payerMemberId: next.paidByMemberId,
                              receivedByMemberId: next.receivedByMemberId,
                            }
                          : current,
                      )
                    }
                  />
                  <SplitForSettlementField
                    classificationType={editState.classificationType}
                    value={editState.splitForSettlement}
                    canSplit={(data?.members.length ?? 0) >= 2}
                    warnWhenLeavingShared={selectedEntry?.classificationType === "shared"}
                    onChange={(splitForSettlement) =>
                      setEditState((current) =>
                        current ? { ...current, splitForSettlement } : current,
                      )
                    }
                  />
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

                <div className="inline-form">
                  <label className="field">
                    <span>Starts</span>
                    <input
                      className="input"
                      type="month"
                      max={latestAllowedStartMonth}
                      value={editState.startsMonth}
                      onChange={(event) =>
                        setEditState((current) =>
                          current ? { ...current, startsMonth: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                </div>
                <p className="helper-text">
                  Change Starts if this began in a different month. Moving it later takes those months out of reports.
                  {nextAmountVersion
                    ? ` It has to stay before ${monthLabel(nextAmountVersion.effectiveStartMonth)}.`
                    : ""}
                </p>

                <div className="action-row">
                  <button
                    className="button"
                    type="button"
                    disabled={isSavingEdit}
                    onClick={() => startSavingEdit(() => void handleSaveRecurringEntry())}
                  >
                    {isSavingEdit ? "Saving..." : "Save rule"}
                  </button>
                  <button
                    className="button button-danger"
                    type="button"
                    disabled={isDeleting}
                    onClick={() => startDeleting(() => void handleDeleteRecurringEntry())}
                  >
                    {isDeleting ? "Deleting..." : "Delete rule"}
                  </button>
                </div>
              </div>

              <details className="disclosure">
                <summary>If the amount changes later</summary>
                <div className="stack compact">
                  <p className="muted-text">
                    Rent going up in January? Keep the old amount through December, then start
                    the new amount from January. Past months stay as they were.
                  </p>
                <div className="inline-form">
                  <label className="field">
                    <span>New amount starts</span>
                    <input
                      className="input"
                      type="month"
                      min={nextMonthInputValue()}
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
                    <CurrencyInput
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
                  {isSavingVersion ? "Saving..." : "Save amount change"}
                </button>
                </div>
              </details>

              <div className="stack compact">
                <h3>Amount history</h3>
                <p className="muted-text">
                  Fix a wrong amount here. That updates reports for those months. To raise rent
                  later, use “If the amount changes later” above.
                </p>
                {versionEditState && editingVersionId ? (
                  <div className="stack compact">
                    <p className="helper-text">
                      Editing {monthLabel(versionEditState.effectiveStartMonth)}.
                    </p>
                    <div className="inline-form">
                      <label className="field">
                        <span>Amount</span>
                        <input
                          className="input"
                          type="number"
                          step="0.01"
                          min="0"
                          value={versionEditState.amount}
                          onChange={(event) =>
                            setVersionEditState((current) =>
                              current ? { ...current, amount: event.target.value } : current,
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Currency</span>
                        <CurrencyInput
                          value={versionEditState.currency}
                          workspaceCurrency={
                            data?.workspaceCurrency ?? versionEditState.currency
                          }
                          onChange={(currency) =>
                            setVersionEditState((current) =>
                              current
                                ? {
                                    ...current,
                                    currency,
                                    normalizationMode:
                                      currency === data?.workspaceCurrency
                                        ? "none"
                                        : current.normalizationMode,
                                  }
                                : current,
                            )
                          }
                        />
                      </label>
                      {versionEditUsesForeignCurrency ? (
                        <NormalizationModeSelect
                          value={versionEditState.normalizationMode}
                          onChange={(normalizationMode) =>
                            setVersionEditState((current) =>
                              current ? { ...current, normalizationMode } : current,
                            )
                          }
                        />
                      ) : null}
                      <label className="field">
                        <span>Notes</span>
                        <input
                          className="input"
                          value={versionEditState.notes}
                          onChange={(event) =>
                            setVersionEditState((current) =>
                              current ? { ...current, notes: event.target.value } : current,
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="action-row">
                      <button
                        className="button"
                        type="button"
                        disabled={isSavingVersionEdit}
                        onClick={() => startSavingVersionEdit(() => void handleUpdateVersion())}
                      >
                        {isSavingVersionEdit ? "Saving..." : "Save amount"}
                      </button>
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => {
                          setEditingVersionId(null);
                          setVersionEditState(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>From</th>
                        <th>Until</th>
                        <th>Amount</th>
                        <th>Mode</th>
                        <th>Notes</th>
                        <th> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {versionsByStart(selectedEntry).map((version) => (
                        <tr
                          className={
                            selectedEntry.currentVersion?.id === version.id
                              ? "table-row-active"
                              : ""
                          }
                          key={version.id}
                        >
                          <td>{monthLabel(version.effectiveStartMonth)}</td>
                          <td>
                            {version.effectiveEndMonth
                              ? monthLabel(version.effectiveEndMonth)
                              : "Ongoing"}
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
                          <td>
                            <div className="action-row">
                              <button
                                className="link-button"
                                type="button"
                                onClick={() => {
                                  setEditingVersionId(version.id);
                                  setVersionEditState(
                                    versionToFormState(
                                      version,
                                      data?.workspaceCurrency ?? version.currency,
                                    ),
                                  );
                                }}
                              >
                                Edit
                              </button>
                              {canRemoveAmountChange(selectedEntry, version) ? (
                                <button
                                  className="link-button"
                                  type="button"
                                  disabled={isDeletingVersion}
                                  onClick={() =>
                                    startDeletingVersion(() => void handleDeleteVersion(version))
                                  }
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </td>
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
