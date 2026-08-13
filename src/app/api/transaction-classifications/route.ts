import { NextResponse } from "next/server";
import { z } from "zod";

import { CLASSIFICATION_TYPES } from "@/features/expenses/constants";
import {
  isClassificationInputError,
  upsertTransactionClassification,
} from "@/features/expenses/classifications";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  transactionId: z.string().uuid(),
  classificationType: z.enum(CLASSIFICATION_TYPES),
  category: z.string().trim().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  memberOwnerId: z.string().uuid().optional().nullable(),
  createRule: z.boolean().optional().default(false),
  additionalTransactionIds: z.array(z.string().uuid()).max(200).optional().default([]),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid classification payload.",
        },
        { status: 400 },
      );
    }

    const result = await withCurrentWorkspaceDb((context, db) =>
      upsertTransactionClassification(context, parsed.data, db),
    );

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/transaction-classifications",
      message: "Failed to save transaction classification",
      clientMessage:
        error instanceof Error ? error.message : "Failed to save transaction classification.",
      status: isClassificationInputError(error) ? 400 : 500,
    });
  }
}
