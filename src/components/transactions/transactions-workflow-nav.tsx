"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const workflowItems = [
  { href: "/transactions", label: "Import" },
  { href: "/transactions/review", label: "Review", attention: "review" as const },
  { href: "/transactions/all", label: "History" },
];

export function TransactionsWorkflowNav({
  reviewBadge,
}: {
  reviewBadge: React.ReactNode;
}) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const shownHref = pendingHref ?? pathname;
  const alive = useRef(true);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  return (
    <nav className="transactions-workflow-nav" aria-label="Transactions workflow">
      {workflowItems.map((item) => {
        const active = shownHref === item.href;

        return (
          <Link
            className={`transactions-workflow-link ${active ? "transactions-workflow-link-active" : ""}`}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const href = item.href;
              setPendingHref(href);
              function release(upEvent: PointerEvent) {
                window.removeEventListener("pointerup", release);
                window.removeEventListener("pointercancel", release);
                if (!alive.current) return;
                const link = event.currentTarget;
                if (!(link instanceof HTMLElement)) return;
                const box = link.getBoundingClientRect();
                const inside =
                  upEvent.clientX >= box.left &&
                  upEvent.clientX <= box.right &&
                  upEvent.clientY >= box.top &&
                  upEvent.clientY <= box.bottom;
                if (!inside) {
                  setPendingHref((current) => (current === href ? null : current));
                }
              }
              window.addEventListener("pointerup", release);
              window.addEventListener("pointercancel", release);
            }}
            key={item.href}
          >
            <span>{item.label}</span>
            {item.attention === "review" ? reviewBadge : null}
          </Link>
        );
      })}
    </nav>
  );
}
