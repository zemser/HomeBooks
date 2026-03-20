import { NextResponse } from "next/server";
import { z } from "zod";

import { CLASSIFICATION_TYPES } from "@/features/expenses/constants";
import { EVENT_KINDS } from "@/features/recurring/constants";
import { updateRecurringEntry } from "@/features/recurring/service";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const runtime = "nodejs";

const updateSchema = z.object({
  title: z.string().trim().min(1),
  eventKind: z.enum(EVENT_KINDS),
  payerMemberId: z.string().uuid().optional().nullable(),
  classificationType: z.enum(CLASSIFICATION_TYPES),
  category: z.string().trim().optional().nullable(),
  active: z.boolean(),
});

type RouteProps = {
  params: Promise<{
    recurringEntryId: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid recurring update payload.",
        },
        { status: 400 },
      );
    }

    const context = await resolveCurrentWorkspaceContext();
    const { recurringEntryId } = await params;
    const result = await updateRecurringEntry(context, recurringEntryId, parsed.data);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update recurring entry.",
      },
      { status: 500 },
    );
  }
}
