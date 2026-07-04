import Link from "next/link";

import { ImportPreviewClient } from "@/components/imports/import-preview-client";
import { listSavedImports } from "@/features/imports/persistence";
import { formatReportMonthLabel } from "@/features/reporting/presentation";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

const importSteps = [
  "Upload CSV or Excel export",
  "Detect provider template",
  "Preview rows and section metadata",
  "Confirm and save the import",
  "Normalize transactions or holdings",
  "Send uncertain items to review queue",
];

const supportedExpenseTemplates = [
  "Max credit-card statements",
  "Cal card exports",
  "Cal recent transactions reports",
];

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const context = await resolveCurrentWorkspaceContext();
  const savedImports = await listSavedImports(context, { type: "bank" });
  const reviewPendingCount = savedImports.reduce(
    (sum, item) => sum + item.reviewPendingCount,
    0,
  );
  const latestImportMonth =
    savedImports[0]?.latestTransactionDate?.slice(0, 7) ?? null;

  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Imports</span>
          <h1>Bank files land here first, then the rest of the workflow unfolds.</h1>
          <p>
            Use this route to upload a real statement, inspect the parsed rows, save the
            import into the workspace, and then continue into the review queue.
          </p>
        </section>

        <section className="card">
          <div className="page-actions">
            <div>
              <h2>Import workflow</h2>
              <p className="muted-text">
                This is the operational start of the expense story, not a detached file tool.
              </p>
            </div>
            <div className="action-row">
              <Link className="button" href="/imports/review">
                {reviewPendingCount > 0
                  ? `Review ${reviewPendingCount} pending row${reviewPendingCount === 1 ? "" : "s"}`
                  : "Open review queue"}
              </Link>
              <Link className="button button-secondary" href="/expenses">
                {latestImportMonth
                  ? `Open ${formatReportMonthLabel(`${latestImportMonth}-01`)} ledger`
                  : "Open ledger"}
              </Link>
            </div>
          </div>

          <div className="home-workflow-list">
            {importSteps.map((item, index) => (
              <div className="home-workflow-step" key={item}>
                <span
                  className={`home-step-state ${index < 4 ? "home-step-state-current" : "home-step-state-up-next"}`}
                >
                  {index < 4 ? "This page" : "Next"}
                </span>
                <div>
                  <strong>{item}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>

        <ImportPreviewClient
          savedImports={savedImports}
          workspaceCurrency={context.baseCurrency}
        />

        <article className="card">
          <div className="page-actions">
            <div>
              <h2>Supported parser templates</h2>
              <p className="muted-text">
                The current expense-first dogfooding path is intentionally narrow so it is easier
                to judge behavior before broadening parser coverage.
              </p>
            </div>
          </div>
          <ul>
            {supportedExpenseTemplates.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>
    </main>
  );
}
