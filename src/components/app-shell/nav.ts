export type AppNavItem = {
  href: string;
  label: string;
  betaLabel?: string | null;
  attention?: "review";
  matchStrategy?: "exact" | "prefix";
  activePaths?: Array<{
    href: string;
    matchStrategy: "exact" | "prefix";
  }>;
};

export type AppNavSection = {
  title: string;
  items: AppNavItem[];
};

export type AppNavigation = {
  desktopSections: AppNavSection[];
  mobileItems: AppNavItem[];
  titleItems: AppNavItem[];
};

const primaryItems: AppNavItem[] = [
  { href: "/", label: "Home", matchStrategy: "exact" },
  {
    href: "/transactions",
    label: "Transactions",
    matchStrategy: "prefix",
    attention: "review",
  },
  { href: "/reports", label: "Reports", matchStrategy: "prefix" },
];

const moreItems: AppNavItem[] = [
  { href: "/recurring", label: "Recurring", matchStrategy: "prefix" },
  { href: "/settlements", label: "Settlements", matchStrategy: "prefix" },
  {
    href: "/investments",
    label: "Investments",
    matchStrategy: "prefix",
    betaLabel: "Beta",
  },
  { href: "/settings", label: "Settings", matchStrategy: "prefix" },
];

const mobileMoreItem: AppNavItem = {
  href: "/more",
  label: "More",
  matchStrategy: "exact",
  activePaths: [
    { href: "/more", matchStrategy: "exact" },
    ...moreItems.map((item) => ({
      href: item.href,
      matchStrategy: item.matchStrategy ?? "prefix",
    })),
  ],
};

export function createAppNavigation(): AppNavigation {
  return {
    desktopSections: [
      { title: "Money", items: primaryItems },
      { title: "More", items: moreItems },
    ],
    mobileItems: [...primaryItems, mobileMoreItem],
    titleItems: [...primaryItems, ...moreItems, mobileMoreItem],
  };
}
