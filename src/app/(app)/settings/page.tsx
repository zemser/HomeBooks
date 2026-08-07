import { SettingsPageClient } from "@/components/settings/settings-page-client";
import { signOutAction } from "@/features/auth/actions";
import { listWorkspaceCategories } from "@/features/workspaces/categories";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { listWorkspaceMembersForSettings } from "@/features/workspaces/members";
import { getWorkspaceSettingsSnapshot } from "@/features/workspaces/settings";
import { getFinappAuthMode } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, members, categories] = await withCurrentWorkspaceDb((context, db) =>
    Promise.all([
      getWorkspaceSettingsSnapshot(context, db),
      listWorkspaceMembersForSettings(context, db),
      listWorkspaceCategories(context, db),
    ]),
  );

  return (
    <main>
      <div className="page-shell stack settings-shell">
        <section className="page-header">
          <div>
            <span className="eyebrow">Settings</span>
            <h1>Workspace settings</h1>
            <p>Manage currency, categories, and household members in one place.</p>
          </div>
          {getFinappAuthMode() === "supabase" ? (
            <form action={signOutAction}>
              <button className="button button-secondary" type="submit">
                Sign out
              </button>
            </form>
          ) : null}
        </section>

        <SettingsPageClient
          initialSettings={settings}
          initialMembers={members}
          initialCategories={categories}
        />
      </div>
    </main>
  );
}
