import { NextResponse } from "next/server";
import { z } from "zod";

import { CLASSIFICATION_TYPES } from "@/features/expenses/constants";
import { EVENT_KINDS, NORMALIZATION_MODES, RECURRENCE_RULES } from "@/features/recurring/constants";
import {
  createRecurringEntry,
  getRecurringPageData,
} from "@/features/recurring/service";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { WorkspaceCategoryInputError } from "@/features/workspaces/categories";
import { errorResponse } from "@/lib/logging/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getSchema = z.object({
  startMonth: z.string().trim().optional(),
  endMonth: z.string().trim().optional(),
});

const createSchema = z.object({
  title: z.string().trim().min(1),
  eventKind: z.enum(EVENT_KINDS),
  payerMemberId: z.string().uuid().optional().nullable(),
  classificationType: z.enum(CLASSIFICATION_TYPES),
  category: z.string().trim().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  effectiveStartMonth: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().length(3),
  normalizationMode: z.enum(NORMALIZATION_MODES),
  recurrenceRule: z.enum(RECURRENCE_RULES),
  notes: z.string().trim().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = getSchema.safeParse({
      startMonth: searchParams.get("startMonth") ?? undefined,
      endMonth: searchParams.get("endMonth") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid recurring range." },
        { status: 400 },
      );
    }

    const data = await withCurrentWorkspaceDb((context, db) =>
      getRecurringPageData(context, parsed.data, db),
    );

    return NextResponse.json(data);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/recurring",
      message: "Failed to load recurring entries",
      clientMessage: error instanceof Error ? error.message : "Failed to load recurring entries.",
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid recurring entry payload.",
        },
        { status: 400 },
      );
    }

    const result = await withCurrentWorkspaceDb((context, db) =>
      createRecurringEntry(context, parsed.data, db),
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/recurring",
      message: "Failed to create recurring entry",
      clientMessage: error instanceof Error ? error.message : "Failed to create recurring entry.",
      status: error instanceof WorkspaceCategoryInputError ? 400 : 500,
    });
  }
}
