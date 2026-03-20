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

        <RecurringPageClient />
      </div>
    </main>
  );
}
