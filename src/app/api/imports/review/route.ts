import { NextResponse } from "next/server";

import { listReviewQueue } from "@/features/expenses/queries";
import { parseReviewQuery } from "@/features/expenses/review-query";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = parseReviewQuery(searchParams);
    const reviewQueue = await withCurrentWorkspaceDb((context, db) =>
      listReviewQueue(context, query, db),
    );

    return NextResponse.json(reviewQueue);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/imports/review",
      message: "Failed to load import review queue",
      clientMessage: error instanceof Error ? error.message : "Failed to load review queue.",
    });
  }
}
