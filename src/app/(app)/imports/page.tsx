import { ImportPreviewClient } from "@/components/imports/import-preview-client";
import { listSavedImports } from "@/features/imports/persistence";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";


async function ImportUpload() {
  const workspaceCurrency = await withCurrentWorkspaceDb(async (context) =>
    context.baseCurrency,
  );

  return (
    <div data-testid="imports-content">
      <ImportPreviewClient mode="upload" workspaceCurrency={workspaceCurrency} />
    </div>
  );
}

async function SavedImportHistory() {
  const { savedImports, workspaceCurrency } = await withCurrentWorkspaceDb(
    async (context, db) => ({
      savedImports: await listSavedImports(context, { type: "bank" }, db),
      workspaceCurrency: context.baseCurrency,
    }),
  );

  return (
    <div data-testid="imports-history">
      <ImportPreviewClient
        mode="history"
        savedImports={savedImports}
        workspaceCurrency={workspaceCurrency}
      />
    </div>
  );
}

export default function ImportsPage() {
  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header" data-testid="imports-shell">
          <div>
            <span className="eyebrow">Imports</span>
            <h1>Add bank transactions</h1>
            <p>Add transactions from a bank statement to your ledger.</p>
          </div>
        </section>

        <Suspense fallback={<RouteDataFallback label="Bank statement upload" />}>
          <ImportUpload />
        </Suspense>
        <Suspense fallback={<RouteDataFallback label="Saved bank statements" />}>
          <SavedImportHistory />
        </Suspense>
      </div>
    </main>
  );
}
import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
