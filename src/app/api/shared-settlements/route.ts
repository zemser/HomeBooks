import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getSharedSettlementsPageData,
  upsertSharedSettlement,
} from "@/features/shared-settlements/service";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";


const requestSchema = z.discriminatedUnion("splitMode", [
  z.object({
    expenseEventId: z.string().uuid(),
    payerMemberId: z.string().uuid(),
    splitMode: z.literal("equal"),
    splitDefinition: z.object({
      participants: z.tuple([z.string().uuid(), z.string().uuid()]),
    }),
    settlementStatus: z.enum(["open", "settled", "ignored"]),
  }),
  z.object({
    expenseEventId: z.string().uuid(),
    payerMemberId: z.string().uuid(),
    splitMode: z.literal("percentage"),
    splitDefinition: z.object({
      shares: z.tuple([
        z.object({
          memberId: z.string().uuid(),
          percentageBps: z.number().int().min(0),
        }),
        z.object({
          memberId: z.string().uuid(),
          percentageBps: z.number().int().min(0),
        }),
      ]),
    }),
    settlementStatus: z.enum(["open", "settled", "ignored"]),
  }),
  z.object({
    expenseEventId: z.string().uuid(),
    payerMemberId: z.string().uuid(),
    splitMode: z.literal("fixed"),
    splitDefinition: z.object({
      shares: z.tuple([
        z.object({
          memberId: z.string().uuid(),
          amount: z.string().trim().min(1),
        }),
        z.object({
          memberId: z.string().uuid(),
          amount: z.string().trim().min(1),
        }),
      ]),
    }),
    settlementStatus: z.enum(["open", "settled", "ignored"]),
  }),
]);

export async function GET(request: Request) {
  try {
    const data = await withCurrentWorkspaceDb((context, db) =>
      getSharedSettlementsPageData(context, db),
    );

    return NextResponse.json(data);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/shared-settlements",
      message: "Failed to load shared settlements",
      clientMessage:
        error instanceof Error ? error.message : "Failed to load shared settlements.",
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid shared settlement payload.",
        },
        { status: 400 },
      );
    }

    const result = await withCurrentWorkspaceDb((context, db) =>
      upsertSharedSettlement(context, parsed.data, db),
    );

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/shared-settlements",
      message: "Failed to save shared settlement",
      clientMessage: error instanceof Error ? error.message : "Failed to save shared settlement.",
    });
  }
}
