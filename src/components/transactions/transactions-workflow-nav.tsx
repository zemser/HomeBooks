"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const workflowItems = [
  { href: "/transactions", label: "Import" },
  { href: "/transactions/review", label: "Review", attention: "review" as const },
  { href: "/transactions/all", label: "All transactions" },
];

export function TransactionsWorkflowNav({
  reviewBadge,
}: {
  reviewBadge: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <nav className="transactions-workflow-nav" aria-label="Transactions workflow">
      {workflowItems.map((item) => {
        const active = pathname === item.href;

        return (
          <Link
            className={`transactions-workflow-link ${active ? "transactions-workflow-link-active" : ""}`}
            href={item.href}
            aria-current={active ? "page" : undefined}
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
