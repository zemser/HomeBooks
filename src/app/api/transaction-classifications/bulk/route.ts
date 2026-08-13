import { NextResponse } from "next/server";
import { z } from "zod";

import { CLASSIFICATION_TYPES } from "@/features/expenses/constants";
import {
  bulkClassifyTransactions,
  isClassificationInputError,
} from "@/features/expenses/classifications";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";


const requestSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1),
  classificationType: z.enum(CLASSIFICATION_TYPES),
  category: z.string().trim().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
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

    const result = await withCurrentWorkspaceDb((context, db) =>
      bulkClassifyTransactions(context, parsed.data, db),
    );

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/transaction-classifications/bulk",
      message: "Failed to bulk classify transactions",
      clientMessage:
        error instanceof Error ? error.message : "Failed to bulk classify transactions.",
      status: isClassificationInputError(error) ? 400 : 500,
    });
  }
}
