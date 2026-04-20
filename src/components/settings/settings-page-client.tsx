"use client";

import { useState, useTransition } from "react";

import type {
  WorkspaceCategoryItem,
  WorkspaceMemberRole,
  WorkspaceMemberSettingsItem,
  WorkspaceSettingsSnapshot,
} from "@/features/workspaces/types";

type WorkspaceMembersResponse = {
  members?: WorkspaceMemberSettingsItem[];
  error?: string;
};

type WorkspaceSettingsResponse = WorkspaceSettingsSnapshot & {
  error?: string;
};

type WorkspaceCategoriesResponse = {
  categories?: WorkspaceCategoryItem[];
  error?: string;
};

type SettingsPageClientProps = {
  initialSettings: WorkspaceSettingsSnapshot;
  initialMembers: WorkspaceMemberSettingsItem[];
  initialCategories: WorkspaceCategoryItem[];
};

function buildNameDrafts(members: WorkspaceMemberSettingsItem[]) {
  return Object.fromEntries(members.map((member) => [member.id, member.displayName]));
}

function buildRoleDrafts(members: WorkspaceMemberSettingsItem[]) {
  return Object.fromEntries(members.map((member) => [member.id, member.role]));
}

export function SettingsPageClient({
  initialSettings,
  initialMembers,
  initialCategories,
}: SettingsPageClientProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [members, setMembers] = useState<WorkspaceMemberSettingsItem[]>(initialMembers);
  const [categories, setCategories] = useState<WorkspaceCategoryItem[]>(initialCategories);
  const [draftNames, setDraftNames] = useState<Record<string, string>>(() => buildNameDrafts(initialMembers));
  const [draftRoles, setDraftRoles] = useState<Record<string, WorkspaceMemberRole>>(
    () => buildRoleDrafts(initialMembers),
  );
  const [baseCurrencyDraft, setBaseCurrencyDraft] = useState(initialSettings.baseCurrency);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [isSavingBaseCurrency, setIsSavingBaseCurrency] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
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
      setDraftNames(buildNameDrafts(nextMembers));
      setDraftRoles(buildRoleDrafts(nextMembers));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load workspace members.",
      );
    }
  }

  async function loadCategories() {
    setError(null);

    try {
      const response = await fetch("/api/workspace-categories");
      const payload = (await response.json()) as WorkspaceCategoriesResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load workspace categories.");
      }

      setCategories(payload.categories ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load workspace categories.",
      );
    }
  }

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

  async function handleCreateCategory() {
    setError(null);
    setMessage(null);
    setIsSavingCategory(true);

    const response = await fetch("/api/workspace-categories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: newCategoryName,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    setIsSavingCategory(false);

    if (!response.ok) {
      setError(payload.error ?? "Could not create workspace category.");
      return;
    }

    setNewCategoryName("");
    await loadCategories();
    setMessage("Workspace category saved.");
  }

  async function handleUpdateMember(
    memberId: string,
    input: { displayName?: string; isActive?: boolean; role?: WorkspaceMemberRole },
  ) {
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

  async function handleSaveBaseCurrency() {
    setError(null);
    setMessage(null);
    setIsSavingBaseCurrency(true);

    const response = await fetch("/api/workspace-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        baseCurrency: baseCurrencyDraft,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as WorkspaceSettingsResponse;

    setIsSavingBaseCurrency(false);

    if (!response.ok) {
      setError(payload.error ?? "Could not update workspace base currency.");
      return;
    }

    setSettings(payload);
    setBaseCurrencyDraft(payload.baseCurrency);
    setMessage("Workspace base currency updated.");
  }

  const activeMembers = members.filter((member) => member.isActive);
  const activeOwners = activeMembers.filter((member) => member.role === "owner");
  const settlementReady = activeMembers.length === 2;
  const normalizedBaseCurrencyDraft = baseCurrencyDraft.trim().toUpperCase();
  const isBaseCurrencyDraftValid = /^[A-Z]{3}$/.test(normalizedBaseCurrencyDraft);

  return (
    <section className="stack">
      <article className="card">
        <div className="summary-strip">
          <div>
            <strong>{settings.baseCurrency}</strong>
            <span>Workspace base currency</span>
          </div>
          <div>
            <strong>{activeMembers.length}</strong>
            <span>Active household members</span>
          </div>
          <div>
            <strong>{activeOwners.length}</strong>
            <span>Active owners</span>
          </div>
          <div>
            <strong>{settlementReady ? "Ready" : "Not ready"}</strong>
            <span>Settlement readiness</span>
          </div>
          <div>
            <strong>{categories.length}</strong>
            <span>Defined categories</span>
          </div>
        </div>
      </article>

      <article className="card stack compact">
        <div className="page-actions">
          <div>
            <h2>Workspace currency</h2>
            <p className="muted-text">
              This is the base currency used by imports, manual entries, recurring generation,
              and reporting. It stays editable only before the workspace has real financial data.
            </p>
          </div>
        </div>

        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            startSaving(() => {
              void handleSaveBaseCurrency();
            });
          }}
        >
          <label className="field">
            <span>Base currency</span>
            <input
              className="input"
              value={baseCurrencyDraft}
              onChange={(event) => setBaseCurrencyDraft(event.target.value.toUpperCase())}
              placeholder="ILS"
              maxLength={3}
              disabled={!settings.canUpdateBaseCurrency || isSavingBaseCurrency}
            />
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button
              className="button"
              type="submit"
              disabled={
                isSaving
                || isSavingBaseCurrency
                || !settings.canUpdateBaseCurrency
                || !isBaseCurrencyDraftValid
                || normalizedBaseCurrencyDraft === settings.baseCurrency
              }
            >
              {isSavingBaseCurrency ? "Saving..." : "Save currency"}
            </button>
          </div>
        </form>

        <p className="muted-text">
          {settings.canUpdateBaseCurrency
            ? "Safe to edit now because the workspace does not have financial records yet."
            : settings.baseCurrencyLockReason}
        </p>
      </article>

      <article className="card stack compact">
        <div className="page-actions">
          <div>
            <h2>Expense categories</h2>
            <p className="muted-text">
              Categories defined here become the shared pick-list for transaction review,
              one-time manual entries, and recurring definitions.
            </p>
          </div>
        </div>

        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            startSaving(() => {
              void handleCreateCategory();
            });
          }}
        >
          <label className="field">
            <span>New category</span>
            <input
              className="input"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="Groceries"
            />
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button
              className="button"
              type="submit"
              disabled={isSaving || isSavingCategory}
            >
              {isSavingCategory ? "Saving..." : "Add category"}
            </button>
          </div>
        </form>

        {categories.length === 0 ? (
          <p className="empty-state">
            No categories are defined yet. Add the ones you want people to pick from, like rent,
            groceries, and transport.
          </p>
        ) : (
          <div className="action-row">
            {categories.map((category) => (
              <span className="badge badge-neutral" key={category.id}>
                {category.name}
              </span>
            ))}
          </div>
        )}
      </article>

      <article className="card stack compact">
        <div className="page-actions">
          <div>
            <h2>Settlement readiness</h2>
            <p className="muted-text">
              Shared settlements are designed around exactly two active members. You can keep more
              member records in the workspace, but only two should stay active when settlement flows
              are in use.
            </p>
          </div>
        </div>

        <div className="summary-strip">
          <div>
            <strong>{activeMembers.length}</strong>
            <span>Active members now</span>
          </div>
          <div>
            <strong>{members.length}</strong>
            <span>Total member records</span>
          </div>
          <div>
            <strong>{activeOwners.length}</strong>
            <span>Owners with access</span>
          </div>
          <div>
            <strong>{settlementReady ? "Exactly 2" : "Needs review"}</strong>
            <span>Settlement rule</span>
          </div>
        </div>

        <p className="muted-text">
          {settlementReady
            ? "The workspace is ready for pairwise settlement flows."
            : activeMembers.length < 2
              ? "Add or reactivate a second member before relying on shared settlement screens."
              : "Too many active members are enabled for the current pairwise settlement model. Deactivate extra records when you want settlements to be accurate."}
        </p>
      </article>

      <article className="card stack compact">
        <div className="page-actions">
          <div>
            <h2>Household members</h2>
            <p className="muted-text">
              Shared settlements need exactly two active members. Add a member here, rename
              them with a display override, promote another owner if needed, or deactivate old
              records without breaking the workspace.
            </p>
          </div>
        </div>

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

        {members.length === 0 ? (
          <p className="empty-state">No workspace members found yet.</p>
        ) : null}

        {members.length > 0 ? (
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
                {members.map((member) => {
                  const draftName = draftNames[member.id] ?? member.displayName;
                  const draftRole = draftRoles[member.id] ?? member.role;
                  const hasPendingChanges =
                    draftName !== member.displayName || draftRole !== member.role;
                  const canDeactivate =
                    !member.isActive
                    || (
                      activeMembers.length > 1
                      && (member.role !== "owner" || activeOwners.length > 1)
                    );

                  return (
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
                    <td>
                      <select
                        className="input"
                        value={draftRoles[member.id] ?? member.role}
                        disabled={pendingMemberId === member.id}
                        onChange={(event) =>
                          setDraftRoles((current) => ({
                            ...current,
                            [member.id]: event.target.value as WorkspaceMemberRole,
                          }))
                        }
                      >
                        <option value="owner">owner</option>
                        <option value="member">member</option>
                      </select>
                    </td>
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
                          disabled={pendingMemberId === member.id || !hasPendingChanges}
                          onClick={() =>
                            startSaving(() => {
                              void handleUpdateMember(member.id, {
                                displayName: draftName,
                                role: draftRole,
                              });
                            })
                          }
                        >
                          {pendingMemberId === member.id ? "Saving..." : "Save changes"}
                        </button>
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={pendingMemberId === member.id || !canDeactivate}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <p className="muted-text">
          At least one active owner and one active household member must remain. Promote another
          owner before demoting or deactivating the current one.
        </p>
      </article>
    </section>
  );
}
