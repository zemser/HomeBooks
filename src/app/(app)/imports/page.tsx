import { ImportPreviewClient } from "@/components/imports/import-preview-client";
import { listSavedImports } from "@/features/imports/persistence";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const { savedImports, workspaceCurrency } = await withCurrentWorkspaceDb(
    async (context, db) => ({
      savedImports: await listSavedImports(context, { type: "bank" }, db),
      workspaceCurrency: context.baseCurrency,
    }),
  );

  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header">
          <div>
            <span className="eyebrow">Imports</span>
            <h1>Add bank transactions</h1>
            <p>Add transactions from a bank statement to your ledger.</p>
          </div>
        </section>

        <ImportPreviewClient
          savedImports={savedImports}
          workspaceCurrency={workspaceCurrency}
        />

      </div>
    </main>
  );
}
