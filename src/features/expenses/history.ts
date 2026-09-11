import type { DbExecutor } from "@/db";
import { listHistoryPageData } from "@/features/expenses/queries";
import {
  shouldShowHistoryManuals,
  type ParsedHistoryQuery,
} from "@/features/expenses/history-query";
import type { ExpensesPageData } from "@/features/expenses/types";
import { listOneTimeManualEntries } from "@/features/manual-entries/service";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";

export async function listHistoryPage(
  context: CurrentWorkspaceContext,
  parsed: ParsedHistoryQuery,
  db: DbExecutor,
): Promise<ExpensesPageData> {
  const data = await listHistoryPageData(context, parsed, db);
  const oneTimeManualEntries = shouldShowHistoryManuals(data.query)
    ? await listOneTimeManualEntries(context, db, { month: data.query.month })
    : [];

  return {
    transactions: data.transactions,
    oneTimeManualEntries,
    members: data.members,
    categories: data.categories,
    categoryCatalog: data.categoryCatalog,
    pagination: data.pagination,
    filterOptions: data.filterOptions,
    scope: data.scope,
    query: data.query,
  };
}
