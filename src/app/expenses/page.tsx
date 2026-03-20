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

        <ExpensesPageClient />
      </div>
    </main>
  );
}
