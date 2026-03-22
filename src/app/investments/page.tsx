import { InvestmentPreviewClient } from "@/components/investments/investment-preview-client";

export default function InvestmentsPage() {
  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Investments</span>
          <h1>Preview investment workbooks before we persist anything.</h1>
          <p>
            Upload an Excellence Excel file to inspect holdings metadata, warnings, and
            parsed rows in a dedicated sidecar flow.
          </p>
        </section>

        <InvestmentPreviewClient />
      </div>
    </main>
  );
}
