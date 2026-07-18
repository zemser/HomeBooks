import { RecurringPageClient } from "@/components/recurring/recurring-page-client";

export default function RecurringPage() {
  return (
    <main>
      <div className="page-shell stack recurring-page-shell">
        <section className="page-header">
          <div>
            <span className="eyebrow">Recurring</span>
            <h1>Recurring rules</h1>
            <p>Manage regular income and expenses that imports may miss.</p>
          </div>
        </section>

        <RecurringPageClient />
      </div>
    </main>
  );
}
