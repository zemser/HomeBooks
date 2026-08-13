import { NextResponse } from "next/server";

import { listExpenseTransactions, listWorkspaceMembers } from "@/features/expenses/queries";
import { listOneTimeManualEntries } from "@/features/manual-entries/service";
import { listWorkspaceCategories } from "@/features/workspaces/categories";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { transactions, oneTimeManualEntries, members, categoryCatalog } =
      await withCurrentWorkspaceDb(async (context, db) => {
        const [transactions, oneTimeManualEntries, members, categoryCatalog] = await Promise.all([
          listExpenseTransactions(context, db),
          listOneTimeManualEntries(context, db),
          listWorkspaceMembers(context, db),
          listWorkspaceCategories(context, db),
        ]);

        return { transactions, oneTimeManualEntries, members, categoryCatalog };
      });

    return NextResponse.json({
      transactions,
      oneTimeManualEntries,
      members,
      categories: categoryCatalog.map((category) => category.name),
      categoryCatalog,
    });
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/expenses",
      message: "Failed to load expenses",
      clientMessage: error instanceof Error ? error.message : "Failed to load expenses.",
    });
  }
}
