import { NextResponse } from "next/server";
import { z } from "zod";

import { generateRecurringEntriesForPeriod } from "@/features/recurring/service";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";


const requestSchema = z.object({
  startMonth: z.string().trim().min(1),
  endMonth: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid recurring generation payload.",
        },
        { status: 400 },
      );
    }

    const result = await withCurrentWorkspaceDb((context, db) =>
      generateRecurringEntriesForPeriod(context, parsed.data, db),
    );

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/recurring/generate",
      message: "Failed to generate recurring entries",
      clientMessage:
        error instanceof Error ? error.message : "Failed to generate recurring entries.",
    });
  }
}
