import type { Metadata } from "next";

import { AppShellClient } from "@/components/app-shell/app-shell-client";
import { createAppNavSections } from "@/components/app-shell/nav";
import { getAppShellSnapshot } from "@/features/home/service";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

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
