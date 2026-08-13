"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AppNavSection, AppNavItem } from "@/components/app-shell/nav";

type AppShellClientProps = {
  navSections: AppNavSection[];
  workspaceGlance: React.ReactNode;
  reviewBadge: React.ReactNode;
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
      {item.href === "/imports/review" ? reviewBadge : null}
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
  workspaceGlance,
  reviewBadge,
  children,
}: AppShellClientProps) {
  const pathname = usePathname();
  const primaryItems = navSections[0]?.items ?? [];
  const secondaryItems = navSections[1]?.items ?? [];
  const flatItems = navSections.flatMap((section) => section.items);
  const currentItem = flatItems.find((item) => isActivePath(pathname, item));

  return (
    <div className="app-shell" data-testid="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-inner">
          <Link
            className="app-brand"
            href="/"
          >
            <span className="app-brand-mark">FA</span>
            <span>
              <strong>Fin App</strong>
              <small>Shared household money</small>
            </span>
          </Link>

          {workspaceGlance}

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
                        aria-current={active ? "page" : undefined}
                        key={item.href}
                      >
                        <span>{item.label}</span>
                        <span className="app-nav-meta">
                          {item.betaLabel ? <span className="nav-chip">{item.betaLabel}</span> : null}
                          {item.href === "/imports/review" ? reviewBadge : null}
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
              <Link
                className="mobile-pill-link"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </header>

        <div className="app-main-scroll">{children}</div>

        <nav className="app-mobile-nav" aria-label="Primary mobile navigation">
          {primaryItems.map((item) => (
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
