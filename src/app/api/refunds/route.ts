import { z } from "zod";
import {
  linkRefund,
  refundCandidates,
  RefundLinkError,
} from "@/features/currency/refunds";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";

export async function GET(request: Request) {
  const credit = z
    .string()
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("credit"));
  if (!credit.success)
    return Response.json({ error: "Choose a refund." }, { status: 400 });
  const rows = await withCurrentWorkspaceDb((context, db) =>
    refundCandidates(db, context.workspaceId, credit.data),
  );
  return Response.json(rows);
}

export async function POST(request: Request) {
  const data = z
    .object({ creditId: z.string().uuid(), purchaseId: z.string().uuid() })
    .safeParse(await request.json());
  if (!data.success)
    return Response.json(
      { error: "Choose a refund and its original purchase." },
      { status: 400 },
    );
  try {
    const value = await withCurrentWorkspaceDb((context, db) =>
      linkRefund(db, context, data.data.creditId, data.data.purchaseId),
    );
    return Response.json(value);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/refunds",
      message: "Could not link refund",
      clientMessage:
        error instanceof RefundLinkError
          ? error.message
          : "Could not link the refund.",
      status: error instanceof RefundLinkError ? 409 : 500,
    });
  }
}
