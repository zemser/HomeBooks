import { NextResponse } from "next/server";
import { z } from "zod";

import { generateRecurringEntriesForPeriod } from "@/features/recurring/service";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const runtime = "nodejs";

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

    const context = await resolveCurrentWorkspaceContext();
    const result = await generateRecurringEntriesForPeriod(context, parsed.data);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate recurring entries.",
      },
      { status: 500 },
    );
  }
}
