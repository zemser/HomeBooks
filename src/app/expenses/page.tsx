import Link from "next/link";

import { ExpensesPageClient } from "@/components/expenses/expenses-page-client";

export default function ExpensesPage() {
  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Expenses</span>
          <h1>Persisted transactions become the household ledger.</h1>
          <p>
            This page shows normalized imported transactions, the source account they came
            from, and whether each row still needs a human decision.
          </p>
        </section>

        <section className="card">
          <div className="page-actions">
            <div>
              <h2>Ledger actions</h2>
              <p className="muted-text">
                Use the ledger to validate normalized behavior, add one-off entries, and then move
                forward into recurring rules or reporting.
              </p>
            </div>
            <div className="action-row">
              <Link className="button button-secondary" href="/imports/review">
                Open review queue
              </Link>
              <Link className="button" href="/reports">
                Open reports
              </Link>
            </div>
          </div>
        </section>

        <ExpensesPageClient />
      </div>
    </main>
  );
}
