import { Suspense } from "react";

import { AppShellClient } from "@/components/app-shell/app-shell-client";
import { createAppNavigation } from "@/components/app-shell/nav";
import { ReviewQueueBadge } from "@/components/app-shell/review-queue-badge";
import { resolveAuthenticatedRequestContext } from "@/features/workspaces/current-context";
import { getFinappAuthMode } from "@/lib/supabase/config";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const navigation = createAppNavigation();
  const { appUser, membership } = await resolveAuthenticatedRequestContext();
  const displayName = membership.displayNameOverride?.trim() || appUser.displayName;

  return (
    <AppShellClient
      account={{
        displayName,
        email: appUser.email,
        canSignOut: getFinappAuthMode() === "supabase",
      }}
      navigation={navigation}
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
