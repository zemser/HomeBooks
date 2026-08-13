import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
import { SharedSettlementsPageClient } from "@/components/shared-settlements/shared-settlements-page-client";
import { getSharedSettlementsPageData } from "@/features/shared-settlements/service";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";

async function SettlementsData() {
  const data = await withCurrentWorkspaceDb((context, db) =>
    getSharedSettlementsPageData(context, db),
  );

  return (
    <div data-testid="settlements-content">
      <SharedSettlementsPageClient initialData={data} />
    </div>
  );
}

export default function SettlementsPage() {
  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header" data-testid="settlements-shell">
          <div>
            <span className="eyebrow">Settlements</span>
            <h1>Shared balances</h1>
            <p>Confirm who paid and how shared expenses should be split.</p>
          </div>
        </section>

        <Suspense fallback={<RouteDataFallback label="Shared balances" />}>
          <SettlementsData />
        </Suspense>
      </div>
    </main>
  );
}
