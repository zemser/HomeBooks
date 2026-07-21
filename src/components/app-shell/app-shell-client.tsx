"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";

import type { AppNavSection, AppNavItem } from "@/components/app-shell/nav";

type AppShellClientProps = {
  navSections: AppNavSection[];
  workspaceName: string;
  baseCurrency: string;
  activeMemberCount: number;
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
  onIntent,
}: {
  item: AppNavItem;
  pathname: string;
  onIntent: (href: string) => void;
}) {
  const active = isActivePath(pathname, item);

  return (
    <Link
      className={`app-mobile-nav-item ${active ? "app-mobile-nav-item-active" : ""}`}
      href={item.href}
      aria-current={active ? "page" : undefined}
      prefetch={false}
      onMouseEnter={() => onIntent(item.href)}
      onFocus={() => onIntent(item.href)}
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
  children,
}: AppShellClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const prefetchedHrefs = useRef(new Set<string>());
  const primaryItems = navSections[0]?.items ?? [];
  const secondaryItems = navSections[1]?.items ?? [];
  const flatItems = navSections.flatMap((section) => section.items);
  const currentItem = flatItems.find((item) => isActivePath(pathname, item));

  function prefetchOnIntent(href: string) {
    if (prefetchedHrefs.current.has(href)) return;
    prefetchedHrefs.current.add(href);
    router.prefetch(href);
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-inner">
          <Link
            className="app-brand"
            href="/"
            prefetch={false}
            onMouseEnter={() => prefetchOnIntent("/")}
            onFocus={() => prefetchOnIntent("/")}
          >
            <span className="app-brand-mark">FA</span>
            <span>
              <strong>Fin App</strong>
              <small>Shared household money</small>
            </span>
          </Link>

          <section className="workspace-glance">
            <p className="app-kicker">Current workspace</p>
            <h2>{workspaceName}</h2>
            <p>
              {baseCurrency} base currency · {activeMemberCount} active member
              {activeMemberCount === 1 ? "" : "s"}
            </p>
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
                        aria-current={active ? "page" : undefined}
                        prefetch={false}
                        onMouseEnter={() => prefetchOnIntent(item.href)}
                        onFocus={() => prefetchOnIntent(item.href)}
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
              <Link
                className="mobile-pill-link"
                href={item.href}
                prefetch={false}
                onMouseEnter={() => prefetchOnIntent(item.href)}
                onFocus={() => prefetchOnIntent(item.href)}
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
              onIntent={prefetchOnIntent}
              pathname={pathname}
            />
          ))}
        </nav>
      </div>
    </div>
  );
}
