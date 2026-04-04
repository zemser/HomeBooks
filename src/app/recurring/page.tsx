import Link from "next/link";

import { RecurringPageClient } from "@/components/recurring/recurring-page-client";

export default function RecurringPage() {
  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Recurring</span>
          <h1>Rules for rent, salary, and the money that never comes from a CSV.</h1>
          <p>
            Recurring entries fill the gaps imports cannot cover. They keep version history,
            generate manual rows for future periods, and leave past generated months alone.
          </p>
        </section>

        <section className="card">
          <div className="page-actions">
            <div>
              <h2>Where recurring fits</h2>
              <p className="muted-text">
                This page rounds out the ledger after imports and review, then feeds the reports
                with stable month-to-month items.
              </p>
            </div>
            <div className="action-row">
              <Link className="button button-secondary" href="/expenses">
                Back to expenses
              </Link>
              <Link className="button" href="/reports">
                Continue to reports
              </Link>
            </div>
          </div>
        </section>

        <RecurringPageClient />
      </div>
    </main>
  );
}
