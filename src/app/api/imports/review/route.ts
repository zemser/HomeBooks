import { NextResponse } from "next/server";

import { listReviewQueue } from "@/features/expenses/queries";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await resolveCurrentWorkspaceContext();
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get("transactionId")?.trim() || undefined;
    const reviewQueue = await listReviewQueue(context, transactionId);

    return NextResponse.json(reviewQueue);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load review queue.",
      },
      { status: 500 },
    );
  }
}
