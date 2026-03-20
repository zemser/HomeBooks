import { NextResponse } from "next/server";
import { z } from "zod";

import { NORMALIZATION_MODES, RECURRENCE_RULES } from "@/features/recurring/constants";
import { createRecurringEntryVersion } from "@/features/recurring/service";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const runtime = "nodejs";

const createVersionSchema = z.object({
  effectiveStartMonth: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().length(3),
  normalizationMode: z.enum(NORMALIZATION_MODES),
  recurrenceRule: z.enum(RECURRENCE_RULES),
  notes: z.string().trim().optional().nullable(),
});

type RouteProps = {
  params: Promise<{
    recurringEntryId: string;
  }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const body = await request.json();
    const parsed = createVersionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid recurring version payload.",
        },
        { status: 400 },
      );
    }

    const context = await resolveCurrentWorkspaceContext();
    const { recurringEntryId } = await params;
    const result = await createRecurringEntryVersion(context, {
      recurringEntryId,
      ...parsed.data,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create recurring entry version.",
      },
      { status: 500 },
    );
  }
}
