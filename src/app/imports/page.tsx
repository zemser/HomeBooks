import { ImportPreviewClient } from "@/components/imports/import-preview-client";

const importSteps = [
  "Upload CSV or Excel export",
  "Detect provider template",
  "Preview rows and section metadata",
  "Normalize transactions or holdings",
  "Send uncertain items to review queue",
];

const supportedExpenseTemplates = [
  "Max credit-card statements",
  "Cal card exports",
  "Cal recent transactions reports",
];

const nextParserTargets = [
  "Poalim / Isracard style variants from the examples folder",
  "Investment account Excel imports",
  "CSV-based exports once we have real samples",
];

export default function ImportsPage() {
  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Imports</span>
          <h1>Bank and investment files land here first.</h1>
          <p>
            The import pipeline is the backbone of the product. This area will manage
            uploads, parsing, template matching, and reprocessing.
          </p>
        </section>

        <section className="card">
          <h2>First implementation flow</h2>
          <ul>
            {importSteps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <ImportPreviewClient />

        <section className="two-up">
          <article className="card">
            <h2>Supported in code now</h2>
            <ul>
              {supportedExpenseTemplates.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article className="card">
            <h2>Next parser targets</h2>
            <ul>
              {nextParserTargets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>
      </div>
    </main>
  );
}
