"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AppNavSection, AppNavItem } from "@/components/app-shell/nav";

type AppShellClientProps = {
  navSections: AppNavSection[];
  workspaceName: string;
  baseCurrency: string;
  activeMemberCount: number;
  pairwiseSettlementReady: boolean;
  children: React.ReactNode;
};

function isActivePath(pathname: string, item: AppNavItem) {
  if (item.matchStrategy === "exact") {
    return pathname === item.href;
  }

  if (item.href === "/") {
    return pathname === "/";
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function MobileNavItem({
  item,
  pathname,
}: {
  item: AppNavItem;
  pathname: string;
}) {
  const active = isActivePath(pathname, item);

  return (
    <Link
      className={`app-mobile-nav-item ${active ? "app-mobile-nav-item-active" : ""}`}
      href={item.href}
    >
      <span>{item.label}</span>
      {item.badge ? (
        <span className={`nav-badge ${item.badgeTone === "warning" ? "nav-badge-warning" : ""}`}>
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function AppShellClient({
  navSections,
  workspaceName,
  baseCurrency,
  activeMemberCount,
  pairwiseSettlementReady,
  children,
}: AppShellClientProps) {
  const pathname = usePathname();
  const primaryItems = navSections[0]?.items ?? [];
  const secondaryItems = navSections[1]?.items ?? [];
  const flatItems = navSections.flatMap((section) => section.items);
  const currentItem = flatItems.find((item) => isActivePath(pathname, item));

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-inner">
          <Link className="app-brand" href="/">
            <span className="app-brand-mark">FA</span>
            <span>
              <strong>Fin App</strong>
              <small>Household workflow</small>
            </span>
          </Link>

          <section className="workspace-glance">
            <p className="app-kicker">Current workspace</p>
            <h2>{workspaceName}</h2>
            <p>
              {baseCurrency} base currency · {activeMemberCount} active member
              {activeMemberCount === 1 ? "" : "s"}
            </p>
            <span
              className={`badge ${pairwiseSettlementReady ? "badge-neutral" : "badge-warning"}`}
            >
              {pairwiseSettlementReady ? "Pair ready" : "Setup needed"}
            </span>
          </section>

          <nav className="app-nav" aria-label="Primary application">
            {navSections.map((section) => (
              <div className="app-nav-section" key={section.title}>
                <p className="app-nav-title">{section.title}</p>
                <div className="app-nav-list">
                  {section.items.map((item) => {
                    const active = isActivePath(pathname, item);

                    return (
                      <Link
                        className={`app-nav-link ${active ? "app-nav-link-active" : ""}`}
                        href={item.href}
                        key={item.href}
                      >
                        <span>{item.label}</span>
                        <span className="app-nav-meta">
                          {item.betaLabel ? <span className="nav-chip">{item.betaLabel}</span> : null}
                          {item.badge ? (
                            <span
                              className={`nav-badge ${item.badgeTone === "warning" ? "nav-badge-warning" : ""}`}
                            >
                              {item.badge}
                            </span>
                          ) : null}
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
          <div className="app-mobile-actions">
            {secondaryItems.map((item) => (
              <Link className="mobile-pill-link" href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </header>

        <div className="app-main-scroll">{children}</div>

        <nav className="app-mobile-nav" aria-label="Primary mobile navigation">
          {primaryItems.map((item) => (
            <MobileNavItem item={item} key={item.href} pathname={pathname} />
          ))}
        </nav>
      </div>
    </div>
  );
}
