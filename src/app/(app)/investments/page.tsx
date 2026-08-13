import { InvestmentPreviewClient } from "@/components/investments/investment-preview-client";
import {
  listInvestmentActivities,
  listInvestmentAccountHoldings,
  listInvestmentImports,
} from "@/features/investments/persistence";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { listWorkspaceMembersForSettings } from "@/features/workspaces/members";


async function InvestmentUpload() {
  const { members, currentMemberId, workspaceCurrency } = await withCurrentWorkspaceDb(
    async (context, db) => ({
      members: await listWorkspaceMembersForSettings(context, db),
      currentMemberId: context.memberId,
      workspaceCurrency: context.baseCurrency,
    }),
  );

  return (
    <div data-testid="investments-upload">
      <InvestmentPreviewClient
        initialInvestmentAccountHoldings={[]}
        initialInvestmentActivities={[]}
        initialInvestmentImports={[]}
        initialMembers={members}
        initialCurrentMemberId={currentMemberId}
        workspaceCurrency={workspaceCurrency}
        mode="upload"
      />
    </div>
  );
}

async function SavedInvestments() {
  const { members, imports, accountHoldings, activities, currentMemberId, workspaceCurrency } =
    await withCurrentWorkspaceDb(async (context, db) => {
      const [members, imports, accountHoldings, activities] = await Promise.all([
        listWorkspaceMembersForSettings(context),
        listInvestmentImports(context, db),
        listInvestmentAccountHoldings(context, db),
        listInvestmentActivities(context, db),
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
    <div data-testid="investments-content">
      <InvestmentPreviewClient
        initialInvestmentAccountHoldings={accountHoldings}
        initialInvestmentActivities={activities}
        initialInvestmentImports={imports}
        initialMembers={members}
        initialCurrentMemberId={currentMemberId}
        workspaceCurrency={workspaceCurrency}
        mode="saved"
      />
      {accountHoldings.length === 0 && activities.length === 0 && imports.length === 0 ? (
        <article className="card">
          <p className="empty-state">No saved investment snapshots or activity yet.</p>
        </article>
      ) : null}
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
            <h1>Investment snapshots</h1>
            <p>Preview a workbook, then save the latest holdings and activity.</p>
          </div>
        </section>

        <Suspense fallback={<RouteDataFallback label="Saved investments" />}>
          <SavedInvestments />
        </Suspense>
        <Suspense fallback={<RouteDataFallback label="Investment workbook upload" />}>
          <InvestmentUpload />
        </Suspense>
      </div>
    </main>
  );
}
import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
