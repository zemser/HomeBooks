import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
import { SettingsPageClient } from "@/components/settings/settings-page-client";
import { listWorkspaceCategories } from "@/features/workspaces/categories";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import {
  listPendingInvitesForEmail,
  listWorkspaceInvites,
} from "@/features/workspaces/invites";
import { listWorkspaceMembersForSettings } from "@/features/workspaces/members";
import { getWorkspaceSettingsSnapshot } from "@/features/workspaces/settings";
import type { WorkspaceCategoryItem, WorkspaceInviteItem, WorkspaceMemberRole, WorkspaceMemberSettingsItem, WorkspaceSettingsSnapshot } from "@/features/workspaces/types";

async function SettingsData() {
  const { settings, members, categories, outgoingInvites, incomingInvites, currentMemberRole } =
    await withCurrentWorkspaceDb(async (context, db): Promise<{
      settings: WorkspaceSettingsSnapshot;
      members: WorkspaceMemberSettingsItem[];
      categories: WorkspaceCategoryItem[];
      outgoingInvites: WorkspaceInviteItem[];
      incomingInvites: WorkspaceInviteItem[];
      currentMemberRole: WorkspaceMemberRole;
    }> => {
      const [settings, members, categories, outgoingInvites, incomingInvites] = await Promise.all([
        getWorkspaceSettingsSnapshot(context, db),
        listWorkspaceMembersForSettings(context, db),
        listWorkspaceCategories(context, db),
        listWorkspaceInvites(context, db),
        listPendingInvitesForEmail(db, context.appUser.email),
      ]);

      return {
        settings,
        members,
        categories,
        outgoingInvites,
        incomingInvites,
        currentMemberRole: (context.membership.role === "owner"
          ? "owner"
          : "member") satisfies WorkspaceMemberRole,
      };
    });

  return (
    <div data-testid="settings-content">
        <SettingsPageClient
          currentMemberRole={currentMemberRole}
          initialCategories={categories}
          initialIncomingInvites={incomingInvites}
          initialInvites={outgoingInvites}
          initialMembers={members}
          initialSettings={settings}
        />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <main>
      <div className="page-shell stack settings-shell">
        <section className="page-header" data-testid="settings-shell">
          <div>
            <span className="eyebrow">Settings</span>
            <h1>Workspace settings</h1>
            <p>Manage currency, categories, and household members in one place.</p>
          </div>
        </section>
        <Suspense fallback={<RouteDataFallback label="Workspace settings" />}>
          <SettingsData />
        </Suspense>
      </div>
    </main>
  );
}
