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

        <SharedSettlementsPageClient />
      </div>
    </main>
  );
}
