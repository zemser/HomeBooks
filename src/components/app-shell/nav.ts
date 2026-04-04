import type { AppShellSnapshot } from "@/features/home/types";

export type AppNavItem = {
  href: string;
  label: string;
  badge?: string | null;
  badgeTone?: "warning" | "neutral";
  betaLabel?: string | null;
  matchStrategy?: "exact" | "prefix";
};

export type AppNavSection = {
  title: string;
  items: AppNavItem[];
};

export function createAppNavSections(snapshot: AppShellSnapshot): AppNavSection[] {
  return [
    {
      title: "Workflow",
      items: [
        { href: "/", label: "Home", matchStrategy: "exact" },
        { href: "/imports", label: "Imports", matchStrategy: "exact" },
        {
          href: "/imports/review",
          label: "Review",
          matchStrategy: "prefix",
          badge: snapshot.reviewQueueCount > 0 ? String(snapshot.reviewQueueCount) : null,
          badgeTone: "warning",
        },
        { href: "/expenses", label: "Expenses", matchStrategy: "prefix" },
        { href: "/recurring", label: "Recurring", matchStrategy: "prefix" },
        { href: "/reports", label: "Reports", matchStrategy: "prefix" },
      ],
    },
    {
      title: "More",
      items: [
        { href: "/settlements", label: "Settlements", matchStrategy: "prefix" },
        {
          href: "/investments",
          label: "Investments",
          matchStrategy: "prefix",
          betaLabel: "Beta",
        },
        {
          href: "/settings",
          label: "Settings",
          matchStrategy: "prefix",
          badge: snapshot.settingsNeedsAttention ? "Setup" : null,
          badgeTone: "warning",
        },
      ],
    },
  ];
}
