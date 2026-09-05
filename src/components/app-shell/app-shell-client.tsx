"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AppNavigation, AppNavItem } from "@/components/app-shell/nav";

type AppShellClientProps = {
  navigation: AppNavigation;
  workspaceGlance: React.ReactNode;
  reviewBadge: React.ReactNode;
  children: React.ReactNode;
};

function matchesPath(
  pathname: string,
  href: string,
  matchStrategy: "exact" | "prefix",
) {
  if (matchStrategy === "exact") return pathname === href;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isActivePath(pathname: string, item: AppNavItem) {
  const activePaths = item.activePaths ?? [
    { href: item.href, matchStrategy: item.matchStrategy ?? "prefix" },
  ];
  return activePaths.some((path) =>
    matchesPath(pathname, path.href, path.matchStrategy),
  );
}

function AttentionBadge({
  item,
  reviewBadge,
}: {
  item: AppNavItem;
  reviewBadge: React.ReactNode;
}) {
  return item.attention === "review" ? reviewBadge : null;
}

function MobileNavItem({
  item,
  pathname,
  reviewBadge,
}: {
  item: AppNavItem;
  pathname: string;
  reviewBadge: React.ReactNode;
}) {
  const active = isActivePath(pathname, item);

  return (
    <Link
      className={`app-mobile-nav-item ${active ? "app-mobile-nav-item-active" : ""}`}
      href={item.href}
      aria-current={active ? "page" : undefined}
    >
      <span>{item.label}</span>
      <AttentionBadge item={item} reviewBadge={reviewBadge} />
    </Link>
  );
}

export function AppShellClient({
  navigation,
  workspaceGlance,
  reviewBadge,
  children,
}: AppShellClientProps) {
  const pathname = usePathname();
  const currentItem = navigation.titleItems.find((item) => isActivePath(pathname, item));

  return (
    <div className="app-shell" data-testid="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-inner">
          <Link className="app-brand" href="/">
            <span className="app-brand-mark">FA</span>
            <span>
              <strong>Fin App</strong>
              <small>Shared household money</small>
            </span>
          </Link>

          {workspaceGlance}

          <nav className="app-nav" aria-label="Primary application">
            {navigation.desktopSections.map((section) => (
              <div className="app-nav-section" key={section.title}>
                <p className="app-nav-title">{section.title}</p>
                <div className="app-nav-list">
                  {section.items.map((item) => {
                    const active = isActivePath(pathname, item);

                    return (
                      <Link
                        className={`app-nav-link ${active ? "app-nav-link-active" : ""}`}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        key={item.href}
                      >
                        <span>{item.label}</span>
                        <span className="app-nav-meta">
                          {item.betaLabel ? <span className="nav-chip">{item.betaLabel}</span> : null}
                          <AttentionBadge item={item} reviewBadge={reviewBadge} />
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-mobile-header">
          <div>
            <p className="app-kicker">Fin App</p>
            <h1>{currentItem?.label ?? "Home"}</h1>
          </div>
        </header>

        <div className="app-main-scroll">{children}</div>

        <nav className="app-mobile-nav" aria-label="Primary mobile navigation">
          {navigation.mobileItems.map((item) => (
            <MobileNavItem
              item={item}
              key={item.href}
              pathname={pathname}
              reviewBadge={reviewBadge}
            />
          ))}
        </nav>
      </div>
    </div>
  );
}
