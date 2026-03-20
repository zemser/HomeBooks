import { NextResponse } from "next/server";
import { z } from "zod";

import { CLASSIFICATION_TYPES } from "@/features/expenses/constants";
import { bulkClassifyTransactions } from "@/features/expenses/classifications";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const runtime = "nodejs";

const requestSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1),
  classificationType: z.enum(CLASSIFICATION_TYPES),
  category: z.string().trim().optional().nullable(),
  memberOwnerId: z.string().uuid().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid bulk classification payload.",
        },
        { status: 400 },
      );
    }

    const context = await resolveCurrentWorkspaceContext();
    const result = await bulkClassifyTransactions(context, parsed.data);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to bulk classify transactions.",
      },
      { status: 500 },
    );
  }
}
