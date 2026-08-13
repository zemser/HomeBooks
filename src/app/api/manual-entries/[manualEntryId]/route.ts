import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ONE_TIME_MANUAL_ENTRY_CLASSIFICATION_TYPES,
  ONE_TIME_MANUAL_ENTRY_EVENT_KINDS,
} from "@/features/manual-entries/constants";
import {
  deleteOneTimeManualEntry,
  updateOneTimeManualEntry,
} from "@/features/manual-entries/service";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { WorkspaceCategoryInputError } from "@/features/workspaces/categories";
import { errorResponse } from "@/lib/logging/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  title: z.string().trim().min(1),
  eventKind: z.enum(ONE_TIME_MANUAL_ENTRY_EVENT_KINDS),
  payerMemberId: z.string().uuid().optional().nullable(),
  classificationType: z.enum(ONE_TIME_MANUAL_ENTRY_CLASSIFICATION_TYPES),
  category: z.string().trim().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().positive(),
  eventDate: z.string().trim().min(1),
});

type RouteProps = {
  params: Promise<{
    manualEntryId: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
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

    const { manualEntryId } = await params;
    const result = await withCurrentWorkspaceDb((context, db) =>
      updateOneTimeManualEntry(context, manualEntryId, parsed.data, db),
    );

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/manual-entries/[manualEntryId]",
      message: "Failed to update manual entry",
      clientMessage: error instanceof Error ? error.message : "Failed to update manual entry.",
      status: error instanceof WorkspaceCategoryInputError ? 400 : 500,
    });
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  try {
    const { manualEntryId } = await params;
    const result = await withCurrentWorkspaceDb((context, db) =>
      deleteOneTimeManualEntry(context, manualEntryId, db),
    );

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/manual-entries/[manualEntryId]",
      message: "Failed to delete manual entry",
      clientMessage: error instanceof Error ? error.message : "Failed to delete manual entry.",
    });
  }
}
