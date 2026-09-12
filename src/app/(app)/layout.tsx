import { Suspense } from "react";

import { AppShellClient } from "@/components/app-shell/app-shell-client";
import { createAppNavigation } from "@/components/app-shell/nav";
import { ReviewQueueBadge } from "@/components/app-shell/review-queue-badge";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const navigation = createAppNavigation();

  return (
    <AppShellClient
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
