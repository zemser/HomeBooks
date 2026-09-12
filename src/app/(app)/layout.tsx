import { Suspense } from "react";

import { AccountControl, AccountControlSkeleton } from "@/components/app-shell/account-control";
import { AppShellClient } from "@/components/app-shell/app-shell-client";
import { createAppNavigation } from "@/components/app-shell/nav";
import { ReviewQueueBadge } from "@/components/app-shell/review-queue-badge";
import { resolveAuthenticatedRequestContext } from "@/features/workspaces/current-context";

function AccountSlot() {
  return (
    <Suspense fallback={<AccountControlSkeleton />}>
      <AccountControlLoader />
    </Suspense>
  );
}

async function AccountControlLoader() {
  const { appUser, membership } = await resolveAuthenticatedRequestContext();
  const displayName = membership.displayNameOverride?.trim() || appUser.displayName;

  return <AccountControl displayName={displayName} email={appUser.email} />;
}

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const navigation = createAppNavigation();

  return (
    <AppShellClient
      headerAccount={<AccountSlot />}
      navigation={navigation}
      reviewBadge={(
        <Suspense fallback={null}>
          <ReviewQueueBadge />
        </Suspense>
      )}
      sidebarAccount={<AccountSlot />}
    >
      {children}
    </AppShellClient>
  );
}
