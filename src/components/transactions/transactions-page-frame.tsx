"use client";

import { usePathname } from "next/navigation";

export function TransactionsPageFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isReview = pathname === "/transactions/review";
  const isHistory = pathname === "/transactions/all";

  return (
    <div className={`page-shell stack transactions-shell${isReview ? " transactions-review-shell" : ""}${isReview || isHistory ? " tool-shell" : ""}`}>
      {children}
    </div>
  );
}
