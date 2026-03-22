"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import { formatMoneyDisplay } from "@/features/expenses/presentation";
import { formatSourceKind } from "@/features/reporting/presentation";
import type {
  SharedSettlementItem,
  SharedSettlementsPageData,
  SharedSplitMode,
} from "@/features/shared-settlements/types";

type SharedSettlementsResponse = SharedSettlementsPageData & {
  error?: string;
};

type SettlementDraft = {
  payerMemberId: string;
  splitMode: SharedSplitMode;
  settlementStatus: "open" | "settled" | "ignored";
  percentageByMemberId: Record<string, string>;
  fixedByMemberId: Record<string, string>;
};

function buildDrafts(data: SharedSettlementsPageData) {
  const memberIds = data.activeMembers.map((member) => member.id);
  const items = [...data.needsSplitSetup, ...data.trackedExpenses];

  return Object.fromEntries(
    items.map((item) => {
      const percentageByMemberId = Object.fromEntries(
        memberIds.map((memberId) => [memberId, "5000"]),
      );
      const fixedByMemberId = Object.fromEntries(
        memberIds.map((memberId) => [memberId, "0.00"]),
      );

      if (item.splitState?.splitMode === "percentage") {
        for (const share of item.splitState.splitDefinition.shares) {
          percentageByMemberId[share.memberId] = String(share.percentageBps);
        }
      }

      if (item.splitState?.splitMode === "fixed") {
        for (const share of item.splitState.splitDefinition.shares) {
          fixedByMemberId[share.memberId] = Number(share.amount).toFixed(2);
        }
      } else if (memberIds.length === 2) {
        const firstShare = item.shareBreakdown[0]?.amount ?? item.totalAmount;
        const secondShare =
          item.shareBreakdown[1]?.amount ??
          (memberIds[1]
            ? Number(item.totalAmount) - Number(firstShare)
            : 0);

        fixedByMemberId[memberIds[0]] = Number(firstShare).toFixed(2);
        if (memberIds[1]) {
          fixedByMemberId[memberIds[1]] = Number(secondShare).toFixed(2);
        }
      }

      return [
        item.expenseEventId,
        {
          payerMemberId: item.payerMemberId ?? memberIds[0] ?? "",
          splitMode: item.splitState?.splitMode ?? "equal",
          settlementStatus: item.splitState?.settlementStatus ?? "open",
          percentageByMemberId,
          fixedByMemberId,
        } satisfies SettlementDraft,
      ];
    }),
  );
}

function defaultEqualParticipants(data: SharedSettlementsPageData) {
  return data.activeMembers.map((member) => member.id) as [string, string];
}

function settlementPayload(
  data: SharedSettlementsPageData,
  item: SharedSettlementItem,
  draft: SettlementDraft,
) {
  const participants = defaultEqualParticipants(data);

  if (draft.splitMode === "equal") {
    return {
      expenseEventId: item.expenseEventId,
      payerMemberId: draft.payerMemberId,
      splitMode: "equal" as const,
      splitDefinition: {
        participants,
      },
      settlementStatus: draft.settlementStatus,
    };
  }

  if (draft.splitMode === "percentage") {
    return {
      expenseEventId: item.expenseEventId,
      payerMemberId: draft.payerMemberId,
      splitMode: "percentage" as const,
      splitDefinition: {
        shares: participants.map((memberId) => ({
          memberId,
          percentageBps: Number(draft.percentageByMemberId[memberId] ?? "0"),
        })) as [
          { memberId: string; percentageBps: number },
          { memberId: string; percentageBps: number },
        ],
      },
      settlementStatus: draft.settlementStatus,
    };
  }

  return {
    expenseEventId: item.expenseEventId,
    payerMemberId: draft.payerMemberId,
    splitMode: "fixed" as const,
    splitDefinition: {
      shares: participants.map((memberId) => ({
        memberId,
        amount: draft.fixedByMemberId[memberId] ?? "0",
      })) as [
        { memberId: string; amount: string },
        { memberId: string; amount: string },
      ],
    },
    settlementStatus: draft.settlementStatus,
  };
}

function SettlementEditor({
  data,
  item,
  draft,
  isSaving,
  onChange,
  onSave,
}: {
  data: SharedSettlementsPageData;
  item: SharedSettlementItem;
  draft: SettlementDraft;
  isSaving: boolean;
  onChange: (next: SettlementDraft) => void;
  onSave: () => void;
}) {
  return (
    <article className="card stack compact">
      <div className="page-actions">
        <div>
          <h3>{item.title}</h3>
          <p className="muted-text">
            {item.eventDate} · {formatSourceKind(item.sourceKind)} ·{" "}
            {formatMoneyDisplay(item.totalAmount, item.workspaceCurrency)}
          </p>
          {item.category ? <p className="helper-text">Category: {item.category}</p> : null}
          {item.splitState && item.settlementImpact ? (
            <p className="helper-text">
              Current impact: {item.settlementImpact.fromMemberName} owes{" "}
              {item.settlementImpact.toMemberName}{" "}
              {formatMoneyDisplay(item.settlementImpact.amount, item.workspaceCurrency)}
            </p>
          ) : null}
        </div>
        <span className={`badge ${item.splitState ? "badge-neutral" : "badge-warning"}`}>
          {item.splitState ? item.splitState.settlementStatus : "Needs split setup"}
        </span>
      </div>

      <div className="two-up">
        <label className="field">
          <span>Payer</span>
          <select
            className="input"
            value={draft.payerMemberId}
            onChange={(event) =>
              onChange({
                ...draft,
                payerMemberId: event.target.value,
              })
            }
          >
            {data.activeMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Settlement status</span>
          <select
            className="input"
            value={draft.settlementStatus}
            onChange={(event) =>
              onChange({
                ...draft,
                settlementStatus: event.target.value as SettlementDraft["settlementStatus"],
              })
            }
          >
            <option value="open">Open</option>
            <option value="settled">Settled</option>
            <option value="ignored">Ignored</option>
          </select>
        </label>
      </div>

      <div className="two-up">
        <label className="field">
          <span>Split mode</span>
          <select
            className="input"
            value={draft.splitMode}
            onChange={(event) =>
              onChange({
                ...draft,
                splitMode: event.target.value as SharedSplitMode,
              })
            }
          >
            <option value="equal">Equal</option>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed</option>
          </select>
        </label>
      </div>

      {draft.splitMode === "equal" ? (
        <p className="helper-text">
          Equal mode uses both active members and splits the event total 50/50 with
          6-decimal reconciliation.
        </p>
      ) : null}

      {draft.splitMode === "percentage" ? (
        <div className="two-up">
          {data.activeMembers.map((member) => (
            <label className="field" key={member.id}>
              <span>{member.displayName} basis points</span>
              <input
                className="input"
                inputMode="numeric"
                value={draft.percentageByMemberId[member.id] ?? "0"}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    percentageByMemberId: {
                      ...draft.percentageByMemberId,
                      [member.id]: event.target.value,
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      ) : null}

      {draft.splitMode === "fixed" ? (
        <div className="two-up">
          {data.activeMembers.map((member) => (
            <label className="field" key={member.id}>
              <span>{member.displayName} amount</span>
              <input
                className="input"
                inputMode="decimal"
                value={draft.fixedByMemberId[member.id] ?? "0"}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    fixedByMemberId: {
                      ...draft.fixedByMemberId,
                      [member.id]: event.target.value,
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      ) : null}

      {item.shareBreakdown.length > 0 ? (
        <div className="meta-grid">
          {item.shareBreakdown.map((share) => (
            <div key={share.memberId}>
              <strong>{share.memberName}</strong>
              <p>{formatMoneyDisplay(share.amount, item.workspaceCurrency)}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="action-row">
        <button className="button" type="button" disabled={isSaving} onClick={onSave}>
          {isSaving ? "Saving..." : item.splitState ? "Update split" : "Start tracking"}
        </button>
      </div>
    </article>
  );
}

export function SharedSettlementsPageClient() {
  const [data, setData] = useState<SharedSettlementsPageData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SettlementDraft>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "settled" | "ignored">("all");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  async function loadSettlements() {
    setError(null);

    try {
      const response = await fetch("/api/shared-settlements");
      const payload = (await response.json()) as SharedSettlementsResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load shared settlements.");
      }

      setData(payload);
      setDrafts(buildDrafts(payload));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load shared settlements.",
      );
      setData(null);
      setDrafts({});
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSettlements();
  }, []);

  const filteredTrackedExpenses = useMemo(() => {
    if (!data) {
      return [];
    }

    if (statusFilter === "all") {
      return data.trackedExpenses;
    }

    return data.trackedExpenses.filter(
      (item) => item.splitState?.settlementStatus === statusFilter,
    );
  }, [data, statusFilter]);

  async function handleSave(item: SharedSettlementItem) {
    if (!data) {
      return;
    }

    const draft = drafts[item.expenseEventId];

    if (!draft) {
      setError("Split draft is missing.");
      return;
    }

    setError(null);
    setMessage(null);
    setSavingItemId(item.expenseEventId);

    const response = await fetch("/api/shared-settlements", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settlementPayload(data, item, draft)),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    setSavingItemId(null);

    if (!response.ok) {
      setError(payload.error ?? "Could not save the shared settlement.");
      return;
    }

    await loadSettlements();
    setMessage("Shared settlement saved.");
  }

  return (
    <section className="stack">
      {isLoading ? <p className="status">Loading shared settlements...</p> : null}
      {error ? <p className="status error">{error}</p> : null}
      {message ? <p className="status">{message}</p> : null}

      {data && !data.isPairwiseReady ? (
        <article className="card">
          <p className="status warning">{data.blockingReason}</p>
          <p className="helper-text">
            Shared settlements are pairwise in v1. Open{" "}
            <Link className="link-button" href="/settings">
              settings
            </Link>{" "}
            to reach exactly two active members.
          </p>
        </article>
      ) : null}

      {data ? (
        <article className="card">
          <div className="summary-strip">
            <div>
              <strong>
                {formatMoneyDisplay(data.balanceSummary.amount, data.workspaceCurrency)}
              </strong>
              <span>Net open balance</span>
            </div>
            <div>
              <strong>{data.balanceSummary.summaryText}</strong>
              <span>Current direction</span>
            </div>
            <div>
              <strong>{data.trackedExpenses.filter((item) => item.splitState?.settlementStatus === "open").length}</strong>
              <span>Open tracked shared expenses</span>
            </div>
          </div>
        </article>
      ) : null}

      {data && data.isPairwiseReady ? (
        <>
          <section className="stack">
            <div className="page-actions">
              <div>
                <h2>Needs split setup</h2>
                <p className="muted-text">
                  Shared expenses only affect balances after you confirm payer and split
                  rules.
                </p>
              </div>
            </div>

            {data.needsSplitSetup.length === 0 ? (
              <article className="card">
                <p className="empty-state">
                  No shared expenses are waiting for split setup right now.
                </p>
              </article>
            ) : null}

            {data.needsSplitSetup.map((item) => (
              <SettlementEditor
                key={item.expenseEventId}
                data={data}
                item={item}
                draft={drafts[item.expenseEventId]}
                isSaving={isSaving && savingItemId === item.expenseEventId}
                onChange={(next) =>
                  setDrafts((current) => ({
                    ...current,
                    [item.expenseEventId]: next,
                  }))
                }
                onSave={() =>
                  startSaving(() => {
                    void handleSave(item);
                  })
                }
              />
            ))}
          </section>

          <section className="stack">
            <div className="page-actions">
              <div>
                <h2>Tracked shared expenses</h2>
                <p className="muted-text">
                  Open items affect balances. Settled and ignored items stay visible for
                  auditability.
                </p>
              </div>
              <label className="field">
                <span>Status filter</span>
                <select
                  className="input"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as "all" | "open" | "settled" | "ignored",
                    )
                  }
                >
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="settled">Settled</option>
                  <option value="ignored">Ignored</option>
                </select>
              </label>
            </div>

            {filteredTrackedExpenses.length === 0 ? (
              <article className="card">
                <p className="empty-state">No tracked shared expenses match this filter.</p>
              </article>
            ) : null}

            {filteredTrackedExpenses.map((item) => (
              <SettlementEditor
                key={item.expenseEventId}
                data={data}
                item={item}
                draft={drafts[item.expenseEventId]}
                isSaving={isSaving && savingItemId === item.expenseEventId}
                onChange={(next) =>
                  setDrafts((current) => ({
                    ...current,
                    [item.expenseEventId]: next,
                  }))
                }
                onSave={() =>
                  startSaving(() => {
                    void handleSave(item);
                  })
                }
              />
            ))}
          </section>
        </>
      ) : null}
    </section>
  );
}
