import { ImportPreviewClient } from "@/components/imports/import-preview-client";
import { listSavedImports } from "@/features/imports/persistence";
import {
  resolveCurrentWorkspaceContext,
  runWithWorkspaceDatabaseUser,
} from "@/features/workspaces/current-context";

const supportedExpenseTemplates = [
  "Max credit-card statements",
  "Cal card exports",
  "Cal recent transactions reports",
];

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const context = await resolveCurrentWorkspaceContext();
  const savedImports = await runWithWorkspaceDatabaseUser(context, () =>
    listSavedImports(context, { type: "bank" }),
  );

  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Imports</span>
          <h1>Import bank statement</h1>
          <p>Upload a CSV or Excel statement, preview the rows, then save the transactions.</p>
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
