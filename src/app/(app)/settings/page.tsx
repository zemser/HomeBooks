import Link from "next/link";

import { SettingsPageClient } from "@/components/settings/settings-page-client";
import { signOutAction } from "@/features/auth/actions";
import { listWorkspaceCategories } from "@/features/workspaces/categories";
import { withCurrentWorkspace } from "@/features/workspaces/current-context";
import { listWorkspaceMembersForSettings } from "@/features/workspaces/members";
import { getWorkspaceSettingsSnapshot } from "@/features/workspaces/settings";
import { getFinappAuthMode } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, members, categories] = await withCurrentWorkspace((context) =>
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
          <h1>Workspace settings live here.</h1>
          <p>
            This workspace already works for one person. Add more members only if you want
            to collaborate or use shared-expense features later.
          </p>
        </section>

        <section className="card">
          <div className="page-actions">
            <div>
              <h2>Optional next steps</h2>
              <p className="muted-text">
                Nothing is required for a solo workspace. Base currency is already set,
                categories are optional, and members are only for collaboration later.
              </p>
            </div>
            <div className="action-row">
              <Link className="button button-secondary" href="#currency">
                Jump to currency
              </Link>
              <Link className="button button-secondary" href="#categories">
                Jump to categories
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

          <div className="composition-list">
            <article className="composition-row">
              <div className="composition-row-header">
                <div>
                  <p className="app-kicker">Optional</p>
                  <h3>Add collaborators later</h3>
                </div>
                <span className="badge badge-neutral">Solo ready</span>
              </div>
              <p>
                You can keep the workspace to yourself. Add another person only if you plan
                to share access or use the settlements feature.
              </p>
              <Link className="link-button" href="#members">
                Review members
              </Link>
            </article>

            <article className="composition-row">
              <div className="composition-row-header">
                <div>
                  <p className="app-kicker">Step 2</p>
                  <h3>Confirm the base currency</h3>
                </div>
                <span className="badge badge-neutral">{settings.baseCurrency}</span>
              </div>
              <p>
                This workspace is already set to {settings.baseCurrency}. Change it only if
                your household should use a different three-letter currency code.
              </p>
              <Link className="link-button" href="#currency">
                Go to currency
              </Link>
            </article>

            <article className="composition-row">
              <div className="composition-row-header">
                <div>
                  <p className="app-kicker">Optional</p>
                  <h3>Add categories when you want them</h3>
                </div>
                <span className="badge badge-neutral">{categories.length} categories</span>
              </div>
              <p>
                Categories are optional, but they make review, one-off entries, and recurring
                rules easier to keep consistent.
              </p>
              <Link className="link-button" href="#categories">
                Go to categories
              </Link>
            </article>
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
