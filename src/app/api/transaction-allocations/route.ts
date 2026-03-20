import { NextResponse } from "next/server";
import { z } from "zod";

import { updateTransactionAllocation } from "@/features/expenses/allocation";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const runtime = "nodejs";

const manualAllocationRowSchema = z.object({
  reportMonth: z.string().trim().min(1),
  allocatedAmount: z.string().trim().min(1),
});

const requestSchema = z
  .object({
    transactionId: z.string().uuid(),
    reportingMode: z.enum(["payment_date", "allocated_period"]),
    allocationStrategy: z.enum(["equal_split", "manual_split"]).optional().nullable(),
    coverageStartDate: z.string().trim().optional().nullable(),
    coverageEndDate: z.string().trim().optional().nullable(),
    allocations: z.array(manualAllocationRowSchema).optional().nullable(),
  })
  .superRefine((value, context) => {
    if (value.reportingMode !== "allocated_period") {
      return;
    }

    if (value.allocationStrategy === "manual_split") {
      if (!value.allocations || value.allocations.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Manual split allocations require at least one month row.",
        });
      }

      return;
    }

    if (!value.coverageStartDate || !value.coverageEndDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Adjusted-period allocations require both coverage dates.",
      });
    }
  });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid transaction allocation payload.",
        },
        { status: 400 },
      );
    }

    const context = await resolveCurrentWorkspaceContext();
    const result = await updateTransactionAllocation(context, parsed.data);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save transaction allocation.",
      },
      { status: 500 },
    );
  }
}
