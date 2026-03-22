"use client";

import { useEffect, useState, useTransition } from "react";

import type { WorkspaceMemberSettingsItem } from "@/features/workspaces/types";

type WorkspaceMembersResponse = {
  members?: WorkspaceMemberSettingsItem[];
  error?: string;
};

type SettingsPageClientProps = {
  baseCurrency: string;
};

export function SettingsPageClient({ baseCurrency }: SettingsPageClientProps) {
  const [members, setMembers] = useState<WorkspaceMemberSettingsItem[]>([]);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [newMemberName, setNewMemberName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  async function loadMembers() {
    setError(null);

    try {
      const response = await fetch("/api/workspace-members");
      const payload = (await response.json()) as WorkspaceMembersResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load workspace members.");
      }

      const nextMembers = payload.members ?? [];
      setMembers(nextMembers);
      setDraftNames(
        Object.fromEntries(nextMembers.map((member) => [member.id, member.displayName])),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load workspace members.",
      );
      setMembers([]);
      setDraftNames({});
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadMembers();
  }, []);

  async function handleCreateMember() {
    setError(null);
    setMessage(null);
    setPendingMemberId("new");

    const response = await fetch("/api/workspace-members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName: newMemberName,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    setPendingMemberId(null);

    if (!response.ok) {
      setError(payload.error ?? "Could not create workspace member.");
      return;
    }

    setNewMemberName("");
    await loadMembers();
    setMessage("Workspace member created.");
  }

  async function handleUpdateMember(memberId: string, input: { displayName?: string; isActive?: boolean }) {
    setError(null);
    setMessage(null);
    setPendingMemberId(memberId);

    const response = await fetch(`/api/workspace-members/${memberId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    setPendingMemberId(null);

    if (!response.ok) {
      setError(payload.error ?? "Could not update workspace member.");
      return;
    }

    await loadMembers();
    setMessage("Workspace member updated.");
  }

  const activeMembers = members.filter((member) => member.isActive);

  return (
    <section className="stack">
      <article className="card">
        <div className="summary-strip">
          <div>
            <strong>{baseCurrency}</strong>
            <span>Workspace base currency</span>
          </div>
          <div>
            <strong>{activeMembers.length}</strong>
            <span>Active household members</span>
          </div>
          <div>
            <strong>{members.length}</strong>
            <span>Total member records</span>
          </div>
        </div>
      </article>

      <article className="card stack compact">
        <div className="page-actions">
          <div>
            <h2>Household members</h2>
            <p className="muted-text">
              Shared settlements need exactly two active members. Add a member here, rename
              them with a display override, or deactivate old records.
            </p>
          </div>
        </div>

        {isLoading ? <p className="status">Loading settings...</p> : null}
        {error ? <p className="status error">{error}</p> : null}
        {message ? <p className="status">{message}</p> : null}

        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            startSaving(() => {
              void handleCreateMember();
            });
          }}
        >
          <label className="field">
            <span>New member display name</span>
            <input
              className="input"
              value={newMemberName}
              onChange={(event) => setNewMemberName(event.target.value)}
              placeholder="Alex"
            />
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button
              className="button"
              type="submit"
              disabled={isSaving || pendingMemberId === "new"}
            >
              {pendingMemberId === "new" ? "Creating..." : "Add member"}
            </button>
          </div>
        </form>

        {!isLoading && members.length === 0 ? (
          <p className="empty-state">No workspace members found yet.</p>
        ) : null}

        {!isLoading && members.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Role</th>
                  <th>Override</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <strong>{member.displayName}</strong>
                      <div className="table-note">Account name: {member.userDisplayName}</div>
                    </td>
                    <td>
                      <span className={`badge ${member.isActive ? "badge-neutral" : "badge-warning"}`}>
                        {member.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>{member.role}</td>
                    <td>
                      <input
                        className="input"
                        value={draftNames[member.id] ?? member.displayName}
                        onChange={(event) =>
                          setDraftNames((current) => ({
                            ...current,
                            [member.id]: event.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>
                      <div className="action-row">
                        <button
                          className="button"
                          type="button"
                          disabled={pendingMemberId === member.id}
                          onClick={() =>
                            startSaving(() => {
                              void handleUpdateMember(member.id, {
                                displayName: draftNames[member.id] ?? member.displayName,
                              });
                            })
                          }
                        >
                          {pendingMemberId === member.id ? "Saving..." : "Save name"}
                        </button>
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={pendingMemberId === member.id}
                          onClick={() =>
                            startSaving(() => {
                              void handleUpdateMember(member.id, {
                                isActive: !member.isActive,
                              });
                            })
                          }
                        >
                          {member.isActive ? "Deactivate" : "Reactivate"}
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
  );
}
