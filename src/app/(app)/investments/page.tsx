import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
import { InvestmentPreviewClient } from "@/components/investments/investment-preview-client";
import {
  listInvestmentAccountHoldings,
  listInvestmentImports,
} from "@/features/investments/persistence";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { listWorkspaceMembersForSettings } from "@/features/workspaces/members";

async function Investments() {
  const { members, imports, accountHoldings, currentMemberId, workspaceCurrency } =
    await withCurrentWorkspaceDb(async (context, db) => {
      const [members, imports, accountHoldings] = await Promise.all([
        listWorkspaceMembersForSettings(context, db),
        listInvestmentImports(context, db),
        listInvestmentAccountHoldings(context, db),
      ]);

      return {
        members,
        imports,
        accountHoldings,
        currentMemberId: context.memberId,
        workspaceCurrency: context.baseCurrency,
      };
    });

  return (
    <div data-testid="investments-content">
      <InvestmentPreviewClient
        initialInvestmentAccountHoldings={accountHoldings}
        initialInvestmentImports={imports}
        initialMembers={members}
        initialCurrentMemberId={currentMemberId}
        workspaceCurrency={workspaceCurrency}
      />
    </div>
  );
}

export default function InvestmentsPage() {
  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header" data-testid="investments-shell">
          <div>
            <span className="eyebrow">Investments · Beta</span>
            <h1>Investment holdings</h1>
            <p>Latest holdings for each account. Filter one person or everyone, then export the table.</p>
          </div>
        </section>

        <Suspense fallback={<RouteDataFallback label="Saved investments" />}>
          <Investments />
        </Suspense>
      </div>
    </main>
  );
}
