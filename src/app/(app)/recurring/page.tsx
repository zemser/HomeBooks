import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
import { RecurringPageClient } from "@/components/recurring/recurring-page-client";
import { getRecurringPageData } from "@/features/recurring/service";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";

async function RecurringData() {
  const data = await withCurrentWorkspaceDb((context, db) =>
    getRecurringPageData(context, undefined, db),
  );

  return (
    <div data-testid="recurring-content">
      <RecurringPageClient initialData={data} />
    </div>
  );
}

export default function RecurringPage() {
  return (
    <main>
      <div className="page-shell stack recurring-page-shell">
        <section className="page-header" data-testid="recurring-shell">
          <div>
            <span className="eyebrow">Recurring</span>
            <h1>Recurring rules</h1>
            <p>Manage regular income and expenses that imports may miss.</p>
          </div>
        </section>

        <Suspense fallback={<RouteDataFallback label="Recurring rules" />}>
          <RecurringData />
        </Suspense>
      </div>
    </main>
  );
}
