import Link from "next/link";

import { SharedSettlementsPageClient } from "@/components/shared-settlements/shared-settlements-page-client";

export default function SettlementsPage() {
  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Shared settlements</span>
          <h1>Track imported, manual, and recurring shared expenses in one place.</h1>
          <p>
            Shared items only enter balances after you confirm who paid and how each
            expense should be split across the active household pair.
          </p>
        </section>

        <section className="card">
          <div className="page-actions">
            <div>
              <h2>Secondary workflow surface</h2>
              <p className="muted-text">
                Settlements stay available, but they should not distract from the main expense
                workflow until the household setup is ready.
              </p>
            </div>
            <div className="action-row">
              <Link className="button button-secondary" href="/settings">
                Open settings
              </Link>
              <Link className="button" href="/expenses">
                Back to expenses
              </Link>
            </div>
          </div>
        </section>

        <SharedSettlementsPageClient />
      </div>
    </main>
  );
}
