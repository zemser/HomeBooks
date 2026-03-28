import { InvestmentPreviewClient } from "@/components/investments/investment-preview-client";
import {
  listInvestmentAccountHoldings,
  listInvestmentImports,
} from "@/features/investments/persistence";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";
import { listWorkspaceMembersForSettings } from "@/features/workspaces/members";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const context = await resolveCurrentWorkspaceContext();
  const [members, imports, accountHoldings] = await Promise.all([
    listWorkspaceMembersForSettings(context),
    listInvestmentImports(context),
    listInvestmentAccountHoldings(context),
  ]);

  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Investments</span>
          <h1>Preview, save, and summarize Excellence holdings snapshots.</h1>
          <p>
            Upload an Excellence Excel file to inspect holdings metadata, warnings,
            parsed rows, and latest portfolio summaries before you save the snapshot
            into the workspace.
          </p>
        </section>

        <InvestmentPreviewClient
          initialInvestmentAccountHoldings={accountHoldings}
          initialInvestmentImports={imports}
          initialMembers={members}
          initialCurrentMemberId={context.memberId}
          workspaceCurrency={context.baseCurrency}
        />
      </div>
    </main>
  );
}
