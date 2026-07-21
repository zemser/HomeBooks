import { InvestmentPreviewClient } from "@/components/investments/investment-preview-client";
import {
  listInvestmentActivities,
  listInvestmentAccountHoldings,
  listInvestmentImports,
} from "@/features/investments/persistence";
import { withCurrentWorkspace } from "@/features/workspaces/current-context";
import { listWorkspaceMembersForSettings } from "@/features/workspaces/members";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const { members, imports, accountHoldings, activities, currentMemberId, workspaceCurrency } =
    await withCurrentWorkspace(async (context) => {
      const [members, imports, accountHoldings, activities] = await Promise.all([
        listWorkspaceMembersForSettings(context),
        listInvestmentImports(context),
        listInvestmentAccountHoldings(context),
        listInvestmentActivities(context),
      ]);

      return {
        members,
        imports,
        accountHoldings,
        activities,
        currentMemberId: context.memberId,
        workspaceCurrency: context.baseCurrency,
      };
    });

  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header">
          <div>
            <span className="eyebrow">Investments · Beta</span>
            <h1>Investment snapshots</h1>
            <p>Preview a workbook, then save the latest holdings and activity.</p>
          </div>
        </section>

        <InvestmentPreviewClient
          initialInvestmentAccountHoldings={accountHoldings}
          initialInvestmentActivities={activities}
          initialInvestmentImports={imports}
          initialMembers={members}
          initialCurrentMemberId={currentMemberId}
          workspaceCurrency={workspaceCurrency}
        />
      </div>
    </main>
  );
}
