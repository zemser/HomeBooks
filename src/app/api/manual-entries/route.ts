import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ONE_TIME_MANUAL_ENTRY_CLASSIFICATION_TYPES,
  ONE_TIME_MANUAL_ENTRY_EVENT_KINDS,
} from "@/features/manual-entries/constants";
import { createOneTimeManualEntry } from "@/features/manual-entries/service";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const runtime = "nodejs";

const requestSchema = z.object({
  title: z.string().trim().min(1),
  eventKind: z.enum(ONE_TIME_MANUAL_ENTRY_EVENT_KINDS),
  payerMemberId: z.string().uuid().optional().nullable(),
  classificationType: z.enum(ONE_TIME_MANUAL_ENTRY_CLASSIFICATION_TYPES),
  category: z.string().trim().optional().nullable(),
  amount: z.coerce.number().positive(),
  eventDate: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid manual entry payload.",
        },
        { status: 400 },
      );
    }

    const context = await resolveCurrentWorkspaceContext();
    const result = await createOneTimeManualEntry(context, parsed.data);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create manual entry.",
      },
      { status: 500 },
    );
  }
}
