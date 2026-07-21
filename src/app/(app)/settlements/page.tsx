import { SharedSettlementsPageClient } from "@/components/shared-settlements/shared-settlements-page-client";

export default function SettlementsPage() {
  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header">
          <div>
            <span className="eyebrow">Settlements</span>
            <h1>Shared balances</h1>
            <p>Confirm who paid and how shared expenses should be split.</p>
          </div>
        </section>

        <SharedSettlementsPageClient />
      </div>
    </main>
  );
}
