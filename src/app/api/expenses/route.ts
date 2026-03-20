import { NextResponse } from "next/server";

import { listExpenseTransactions } from "@/features/expenses/queries";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await resolveCurrentWorkspaceContext();
    const transactions = await listExpenseTransactions(context);

    return NextResponse.json({
      transactions,
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
