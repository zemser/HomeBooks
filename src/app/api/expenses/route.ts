import { NextResponse } from "next/server";

import { parseHistoryQuery } from "@/features/expenses/history-query";
import { listHistoryPage } from "@/features/expenses/history";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsedQuery = parseHistoryQuery(searchParams);
    const data = await withCurrentWorkspaceDb((context, db) =>
      listHistoryPage(context, parsedQuery, db),
    );

    return NextResponse.json(data);
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
