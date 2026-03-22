import { NextResponse } from "next/server";

import { listExpenseTransactions, listWorkspaceMembers } from "@/features/expenses/queries";
import { listOneTimeManualEntries } from "@/features/manual-entries/service";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await resolveCurrentWorkspaceContext();
    const [transactions, oneTimeManualEntries, members] = await Promise.all([
      listExpenseTransactions(context),
      listOneTimeManualEntries(context),
      listWorkspaceMembers(context),
    ]);

    return NextResponse.json({
      transactions,
      oneTimeManualEntries,
      members,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load expenses.",
      },
      { status: 500 },
    );
  }
}
