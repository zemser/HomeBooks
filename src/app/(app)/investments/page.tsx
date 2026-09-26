import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
import { InvestmentsPageClient } from "@/components/investments/investments-page-client";
import { listInvestmentAccountHoldings } from "@/features/investments/persistence";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { listWorkspaceMembersForSettings } from "@/features/workspaces/members";

async function Investments() {
  const { members, accountHoldings, currentMemberId, workspaceCurrency } =
    await withCurrentWorkspaceDb(async (context, db) => {
      const [members, accountHoldings] = await Promise.all([
        listWorkspaceMembersForSettings(context, db),
        listInvestmentAccountHoldings(context, db),
      ]);

      return {
        members,
        accountHoldings,
        currentMemberId: context.memberId,
        workspaceCurrency: context.baseCurrency,
      };
    });

  return (
    <div data-testid="investments-content">
      <InvestmentsPageClient
        initialAccounts={accountHoldings}
        members={members}
        currentMemberId={currentMemberId}
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
            <h1>Investments</h1>
            <p>Your accounts at their latest export. Upload a newer export whenever you want to refresh one.</p>
          </div>
        </section>

        <Suspense fallback={<RouteDataFallback label="Investments" />}>
          <Investments />
        </Suspense>
      </div>
    </main>
  );
}
