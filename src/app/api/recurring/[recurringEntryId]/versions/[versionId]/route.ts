import { NextResponse } from "next/server";
import { z } from "zod";

import { NORMALIZATION_MODES } from "@/features/recurring/constants";
import {
  deleteRecurringEntryVersion,
  updateRecurringEntryVersion,
} from "@/features/recurring/service";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";

const updateVersionSchema = z.object({
  amount: z.coerce.number().positive(),
  currency: z.string().trim().length(3),
  normalizationMode: z.enum(NORMALIZATION_MODES),
  notes: z.string().trim().optional().nullable(),
});

type RouteProps = {
  params: Promise<{
    recurringEntryId: string;
    versionId: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const body = await request.json();
    const parsed = updateVersionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid amount update payload.",
        },
        { status: 400 },
      );
    }

    const { recurringEntryId, versionId } = await params;
    const result = await withCurrentWorkspaceDb((context, db) =>
      updateRecurringEntryVersion(context, {
        recurringEntryId,
        versionId,
        ...parsed.data,
      }, db),
    );

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/recurring/[recurringEntryId]/versions/[versionId]",
      message: "Failed to update recurring amount",
      clientMessage:
        error instanceof Error ? error.message : "Failed to update recurring amount.",
    });
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  try {
    const { recurringEntryId, versionId } = await params;
    const result = await withCurrentWorkspaceDb((context, db) =>
      deleteRecurringEntryVersion(context, recurringEntryId, versionId, db),
    );

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/recurring/[recurringEntryId]/versions/[versionId]",
      message: "Failed to remove recurring amount change",
      clientMessage:
        error instanceof Error
          ? error.message
          : "Failed to remove recurring amount change.",
    });
  }
}
