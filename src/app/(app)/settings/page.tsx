import Link from "next/link";

import { SettingsPageClient } from "@/components/settings/settings-page-client";
import { signOutAction } from "@/features/auth/actions";
import { listWorkspaceCategories } from "@/features/workspaces/categories";
import {
  resolveCurrentWorkspaceContext,
  runWithWorkspaceDatabaseUser,
} from "@/features/workspaces/current-context";
import { listWorkspaceMembersForSettings } from "@/features/workspaces/members";
import { getWorkspaceSettingsSnapshot } from "@/features/workspaces/settings";
import { getFinappAuthMode } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const context = await resolveCurrentWorkspaceContext();
  const [settings, members, categories] = await runWithWorkspaceDatabaseUser(context, () =>
    Promise.all([
      getWorkspaceSettingsSnapshot(context),
      listWorkspaceMembersForSettings(context),
      listWorkspaceCategories(context),
    ]),
  );

  return (
    <main>
      <div className="page-shell stack settings-shell">
        <section className="hero">
          <span className="eyebrow">Settings</span>
          <h1>Household configuration lives here.</h1>
          <p>
            Household members shape classification, recurring inputs, and the new
            settlement workflow. This page keeps the member roster usable even before
            full auth and invites arrive.
          </p>
        </section>

        <section className="card">
          <div className="page-actions">
            <div>
              <h2>Setup first, then workflow</h2>
              <p className="muted-text">
                Settings is the setup surface for base currency, member ownership, and pairwise
                settlement readiness before you lean on the rest of the app.
              </p>
            </div>
            <div className="action-row">
              <Link className="button" href="/imports">
                Continue to imports
              </Link>
              <Link className="button button-secondary" href="/settlements">
                Open settlements
              </Link>
              {getFinappAuthMode() === "supabase" ? (
                <form action={signOutAction}>
                  <button className="button button-secondary" type="submit">
                    Sign out
                  </button>
                </form>
              ) : null}
            </div>
          </div>
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
