import { createHash } from "node:crypto";

import { listWorkspaceMembersForSettings } from "@/features/workspaces/members";
import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBankWorkbookWithMonthlyRates } from "@/features/imports/parse-bank-workbook";
import { analyzeParsedBankImport, findExistingBankFileImport } from "@/features/imports/persistence";
import { detectBankTemplate } from "@/features/imports/templates/detect";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";
import { readTabularFileFromBuffer } from "@/lib/tabular/read-tabular-file";

const requestSchema = z.object({
  workspaceCurrency: z.string().trim().length(3).default("ILS"),
});

function buildPreviewWarnings(input: {
  previewTransactions: Array<{ normalizationRateSource: string }>;
}): string[] {
  if (
    input.previewTransactions.some((transaction) =>
      transaction.normalizationRateSource.includes("missing-monthly-rate"),
    )
  ) {
    return [
      "Some rows are flagged Placeholder FX because a monthly average rate is missing. Those amounts are excluded from ILS totals until a rate exists.",
    ];
  }

  return [];
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A non-empty file is required." }, { status: 400 });
  }

  const parsedInput = requestSchema.safeParse({
    workspaceCurrency: formData.get("workspaceCurrency") ?? "ILS",
  });

  if (!parsedInput.success) {
    return NextResponse.json({ error: "Workspace currency must be a 3-letter code." }, { status: 400 });
  }

  try {
    const fileBuffer = await file.arrayBuffer();
    const checksum = createHash("sha256").update(Buffer.from(fileBuffer)).digest("hex");
    const workbook = readTabularFileFromBuffer({
      buffer: fileBuffer,
      filename: file.name,
    });
    const detectedTemplate = detectBankTemplate(workbook);

    if (detectedTemplate.id === "unknown") {
      return NextResponse.json(
        {
          error: detectedTemplate.reason,
          detectedTemplate,
        },
        { status: 422 },
      );
    }

    const { importPlan, members, result, existingImport } = await withCurrentWorkspaceDb(async (context, db) => {
      const result = await parseBankWorkbookWithMonthlyRates({
        workbook,
        workspaceCurrency: parsedInput.data.workspaceCurrency.toUpperCase(),
        db,
      });

      return {
        result,
        importPlan: await analyzeParsedBankImport({ context, parsed: result.parsed, db }),
        members: await listWorkspaceMembersForSettings(context, db),
        existingImport: await findExistingBankFileImport(context.workspaceId, checksum, db),
      };
    });

    return NextResponse.json({
      detectedTemplate,
      accountLabel: result.parsed.accountLabel,
      statementLabel: result.parsed.statementLabel,
      transactionCount: result.previewTransactions.length,
      newTransactionCount: importPlan.newTransactionCount,
      duplicateTransactionCount: importPlan.duplicateTransactionCount,
      automaticRuleCount: importPlan.automaticRuleCount,
      automaticRuleCountWithOwner: importPlan.automaticRuleCountWithOwner,
      automaticRuleCountWithoutOwner: importPlan.automaticRuleCountWithoutOwner,
      accountOwnerMemberId: importPlan.accountOwnerMemberId,
      existingImport,
      members: members.filter((member) => member.isActive).map((member) => ({ id: member.id, displayName: member.displayName })),
      previewTransactions: result.previewTransactions.slice(0, 50),
      warnings: buildPreviewWarnings({
        previewTransactions: result.previewTransactions,
      }),
    });
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/imports/preview",
      message: "Import preview failed",
      clientMessage: "Could not preview this file right now. Please try again.",
    });
  }
}
