import { NextResponse } from "next/server";

import { detectInvestmentTemplate } from "@/features/investments/detect";
import { parseInvestmentWorkbookToPreview } from "@/features/investments/parse-investment-workbook";
import { readTabularFileFromBuffer } from "@/lib/tabular/read-tabular-file";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A non-empty file is required." }, { status: 400 });
  }

  try {
    const workbook = readTabularFileFromBuffer({
      buffer: await file.arrayBuffer(),
      filename: file.name,
    });
    const detectedTemplate = detectInvestmentTemplate(workbook);

    if (detectedTemplate.id === "unknown") {
      return NextResponse.json(
        {
          error: detectedTemplate.reason,
          detectedTemplate,
        },
        { status: 422 },
      );
    }

    const result = parseInvestmentWorkbookToPreview({ workbook });

    return NextResponse.json({
      detectedTemplate: result.detectedTemplate,
      provider: result.preview.provider,
      accountLabel: result.preview.accountLabel,
      snapshotDate: result.preview.snapshotDate,
      snapshotTimestampText: result.preview.snapshotTimestampText,
      holdingCount: result.preview.holdings.length,
      activityCount: result.preview.activities.length,
      holdings: result.preview.holdings,
      activities: result.preview.activities,
      warnings: result.preview.warnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Investment preview failed.",
      },
      { status: 500 },
    );
  }
}
