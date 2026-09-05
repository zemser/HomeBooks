import { Suspense } from "react";

import { AppShellClient } from "@/components/app-shell/app-shell-client";
import { createAppNavigation } from "@/components/app-shell/nav";
import { ReviewQueueBadge } from "@/components/app-shell/review-queue-badge";
import { getRequestShellSnapshot } from "@/features/home/request-shell-snapshot";

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

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const navigation = createAppNavigation();

  return (
    <AppShellClient
      navigation={navigation}
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
