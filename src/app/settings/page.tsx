import { SettingsPageClient } from "@/components/settings/settings-page-client";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const context = await resolveCurrentWorkspaceContext();

  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Settings</span>
          <h1>Household configuration lives here.</h1>
          <p>
            Household members shape classification, recurring inputs, and the new
            settlement workflow. This page keeps the member roster usable even before
            full auth and invites arrive.
          </p>
        </section>

        <SettingsPageClient baseCurrency={context.baseCurrency} />
      </div>
    </main>
  );
}
