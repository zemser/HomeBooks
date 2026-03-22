import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getSharedSettlementsPageData,
  upsertSharedSettlement,
} from "@/features/shared-settlements/service";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const runtime = "nodejs";

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

export async function GET() {
  try {
    const context = await resolveCurrentWorkspaceContext();
    const data = await getSharedSettlementsPageData(context);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load shared settlements.",
      },
      { status: 500 },
    );
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

    const context = await resolveCurrentWorkspaceContext();
    const result = await upsertSharedSettlement(context, parsed.data);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save shared settlement.",
      },
      { status: 500 },
    );
  }
}
