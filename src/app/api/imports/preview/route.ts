import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBankWorkbookToPreview } from "@/features/imports/parse-bank-workbook";
import { detectBankTemplate } from "@/features/imports/templates/detect";
import { readTabularFileFromBuffer } from "@/lib/tabular/read-tabular-file";

const requestSchema = z.object({
  workspaceCurrency: z.string().trim().length(3).default("ILS"),
});

function buildPreviewWarnings(input: {
  workspaceCurrency: string;
  previewTransactions: Array<{ normalizationRateSource: string; settlementCurrency?: string }>;
}): string[] {
  const warnings: string[] = [];

  if (
    input.previewTransactions.some(
      (transaction) =>
        transaction.settlementCurrency &&
        transaction.settlementCurrency !== input.workspaceCurrency,
    )
  ) {
    warnings.push(
      "Foreign-currency rows are still normalized into the workspace currency for now. Full multicurrency reporting is not finished yet.",
    );
  }

  if (
    input.previewTransactions.some((transaction) =>
      transaction.normalizationRateSource.includes("placeholder"),
    )
  ) {
    warnings.push(
      "Rows marked Placeholder FX are still estimates in the workspace currency until historical FX support lands.",
    );
  }

  return warnings;
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
    const workbook = readTabularFileFromBuffer({
      buffer: await file.arrayBuffer(),
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

    const result = parseBankWorkbookToPreview({
      workbook,
      workspaceCurrency: parsedInput.data.workspaceCurrency.toUpperCase(),
    });

    return NextResponse.json({
      detectedTemplate,
      accountLabel: result.parsed.accountLabel,
      statementLabel: result.parsed.statementLabel,
      transactionCount: result.previewTransactions.length,
      previewTransactions: result.previewTransactions.slice(0, 50),
      warnings: buildPreviewWarnings({
        workspaceCurrency: parsedInput.data.workspaceCurrency.toUpperCase(),
        previewTransactions: result.previewTransactions,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Import preview failed.",
      },
      { status: 500 },
    );
  }
}
