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
            Recurring entries fill the gaps imports cannot cover. Save one definition, let the
            app prepare the applicable months automatically, and keep version history when
            amounts change later.
          </p>
        </section>

        <section className="card">
          <div className="page-actions">
            <div>
              <h2>Where recurring fits</h2>
              <p className="muted-text">
                This page rounds out the ledger after imports and review, then feeds reports
                with stable month-to-month items without a separate generate step.
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
