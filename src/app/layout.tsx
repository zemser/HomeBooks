import type { Metadata } from "next";
import { headers } from "next/headers";

import { AppShellClient } from "@/components/app-shell/app-shell-client";
import { createAppNavSections } from "@/components/app-shell/nav";
import { getAppShellSnapshot } from "@/features/home/service";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";
import { SHELLLESS_PATHS, resolveRequestPathname } from "@/lib/routing/request-path";

import "./globals.css";

export const metadata: Metadata = {
  title: "Fin App",
  description: "Couples and families finance workspace scaffold",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const pathname = resolveRequestPathname(headerStore);

  if (SHELLLESS_PATHS.has(pathname)) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }

  const context = await resolveCurrentWorkspaceContext();
  const shellSnapshot = await getAppShellSnapshot(context);
  const navSections = createAppNavSections(shellSnapshot);

  return (
    <html lang="en">
      <body>
        <AppShellClient
          activeMemberCount={shellSnapshot.activeMemberCount}
          baseCurrency={shellSnapshot.baseCurrency}
          navSections={navSections}
          pairwiseSettlementReady={shellSnapshot.pairwiseSettlementReady}
          workspaceName={shellSnapshot.workspaceName}
        >
          {children}
        </AppShellClient>
      </body>
    </html>
  );
}
