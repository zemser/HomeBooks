import { NextResponse } from "next/server";
import { z } from "zod";

import { updateExpenseAllocation } from "@/features/expenses/allocation";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const runtime = "nodejs";

const manualAllocationRowSchema = z.object({
  reportMonth: z.string().trim().min(1),
  allocatedAmount: z.string().trim().min(1),
});

const requestSchema = z
  .object({
    transactionId: z.string().uuid().optional(),
    sourceType: z.enum(["transaction", "manual"]).optional(),
    sourceId: z.string().uuid().optional(),
    reportingMode: z.enum(["payment_date", "allocated_period"]),
    allocationStrategy: z.enum(["equal_split", "manual_split"]).optional().nullable(),
    coverageStartDate: z.string().trim().optional().nullable(),
    coverageEndDate: z.string().trim().optional().nullable(),
    allocations: z.array(manualAllocationRowSchema).optional().nullable(),
  })
  .superRefine((value, context) => {
    const hasTransactionId = Boolean(value.transactionId);
    const hasGenericSource = Boolean(value.sourceType && value.sourceId);

    if (!hasTransactionId && !hasGenericSource) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Allocation updates require a transaction or expense source id.",
      });
    }

    if (value.sourceType && !value.sourceId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Allocation updates require a source id.",
      });
    }

    if (!value.sourceType && value.sourceId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Allocation updates require a source type.",
      });
    }

    if (hasTransactionId && hasGenericSource) {
      const sourceMatchesTransaction =
        value.sourceType === "transaction" && value.sourceId === value.transactionId;

      if (!sourceMatchesTransaction) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provide either transactionId or sourceType/sourceId, not both.",
        });
      }
    }

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
          error: parsed.error.issues[0]?.message ?? "Invalid allocation payload.",
        },
        { status: 400 },
      );
    }

    const context = await resolveCurrentWorkspaceContext();
    const sourceType = parsed.data.sourceType ?? "transaction";
    const sourceId = parsed.data.sourceId ?? parsed.data.transactionId;

    if (!sourceId) {
      return NextResponse.json(
        {
          error: "Allocation updates require a source id.",
        },
        { status: 400 },
      );
    }

    const result = await updateExpenseAllocation(context, {
      sourceType,
      sourceId,
      reportingMode: parsed.data.reportingMode,
      allocationStrategy: parsed.data.allocationStrategy,
      coverageStartDate: parsed.data.coverageStartDate,
      coverageEndDate: parsed.data.coverageEndDate,
      allocations: parsed.data.allocations,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save allocation.",
      },
      { status: 500 },
    );
  }
}
