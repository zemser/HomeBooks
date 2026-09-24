import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
import { ExpensesPageClient } from "@/components/expenses/expenses-page-client";
import { parseHistoryQuery } from "@/features/expenses/history-query";
import { listHistoryPage } from "@/features/expenses/history";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";

type AllTransactionsPageProps = {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
};

async function TransactionHistory({ searchParams }: AllTransactionsPageProps) {
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string") urlParams.set(key, value);
  });
  const parsedQuery = parseHistoryQuery(urlParams);
  const initialData = await withCurrentWorkspaceDb((context, db) =>
    listHistoryPage(context, parsedQuery, db),
  );

  return (
    <div className="stack" data-testid="transactions-all-content">
      <ExpensesPageClient initialData={initialData} />
    </div>
  );
}

export default function AllTransactionsPage({ searchParams }: AllTransactionsPageProps) {
  return (
    <Suspense fallback={<RouteDataFallback label="History" presentation="line" />}>
      <TransactionHistory searchParams={searchParams} />
    </Suspense>
  );
}
