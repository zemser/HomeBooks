import { Suspense, cache } from "react";

import { AppShellClient } from "@/components/app-shell/app-shell-client";
import { createAppNavSections } from "@/components/app-shell/nav";
import { getAppShellSnapshot } from "@/features/home/service";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";

const getRequestShellSnapshot = cache(() =>
  withCurrentWorkspaceDb((context, db) => getAppShellSnapshot(context, db)),
);

async function WorkspaceGlance() {
  const snapshot = await getRequestShellSnapshot();

  return (
    <section className="workspace-glance" data-testid="workspace-glance">
      <p className="app-kicker">Current workspace</p>
      <h2>{snapshot.workspaceName}</h2>
      <p>
        {snapshot.baseCurrency} base currency · {snapshot.activeMemberCount} active member
        {snapshot.activeMemberCount === 1 ? "" : "s"}
      </p>
    </section>
  );
}

function WorkspaceGlanceFallback() {
  return (
    <section className="workspace-glance" aria-busy="true">
      <p className="app-kicker">Current workspace</p>
      <h2>Loading workspace…</h2>
      <p>Loading currency and members…</p>
    </section>
  );
}

async function ReviewQueueBadge() {
  const snapshot = await getRequestShellSnapshot();

  return snapshot.reviewQueueCount > 0 ? (
    <span className="nav-badge nav-badge-warning">{snapshot.reviewQueueCount}</span>
  ) : null;
}

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const navSections = createAppNavSections();

  return (
    <AppShellClient
      navSections={navSections}
      workspaceGlance={(
        <Suspense fallback={<WorkspaceGlanceFallback />}>
          <WorkspaceGlance />
        </Suspense>
      )}
      reviewBadge={(
        <Suspense fallback={null}>
          <ReviewQueueBadge />
        </Suspense>
      )}
    >
      {children}
    </AppShellClient>
  );
}
