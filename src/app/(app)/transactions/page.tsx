import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
import { ImportPreviewClient } from "@/components/imports/import-preview-client";
import { listSavedImports } from "@/features/imports/persistence";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";

async function ImportUpload() {
  const workspaceCurrency = await withCurrentWorkspaceDb(async (context) =>
    context.baseCurrency,
  );

  return (
    <div data-testid="transactions-import-content">
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
    <div data-testid="transactions-import-history">
      <ImportPreviewClient
        mode="history"
        savedImports={savedImports}
        workspaceCurrency={workspaceCurrency}
      />
    </div>
  );
}

export default function TransactionsImportPage() {
  return (
    <>
      <Suspense fallback={<RouteDataFallback label="Bank statement upload" />}>
        <ImportUpload />
      </Suspense>
      <Suspense fallback={<RouteDataFallback label="Saved bank statements" />}>
        <SavedImportHistory />
      </Suspense>
    </>
  );
}
