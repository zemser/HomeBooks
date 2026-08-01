import { NextResponse } from "next/server";
import { z } from "zod";

import { undoClassificationDecision } from "@/features/expenses/classifications";
import { withCurrentWorkspace } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  batchId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid undo request." },
        { status: 400 },
      );
    }

    const result = await withCurrentWorkspace((context) =>
      undoClassificationDecision(context, parsed.data.batchId),
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/transaction-classifications/undo",
      message: "Failed to undo classification decision",
      clientMessage:
        error instanceof Error ? error.message : "Failed to undo classification decision.",
    });
  }
}
