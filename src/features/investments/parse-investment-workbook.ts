import type { WorkbookData } from "@/features/imports/types";
import { detectInvestmentTemplate } from "@/features/investments/detect";
import { excellenceInvestmentPreviewParser } from "@/features/investments/providers/excellence";
import type {
  DetectedInvestmentTemplate,
  InvestmentPreviewParser,
  InvestmentPreviewResult,
} from "@/features/investments/types";

const providerParsers: Record<"excellence", InvestmentPreviewParser> = {
  excellence: excellenceInvestmentPreviewParser,
};

export function parseInvestmentWorkbookToPreview(input: {
  workbook: WorkbookData;
}): {
  detectedTemplate: DetectedInvestmentTemplate;
  preview: InvestmentPreviewResult;
} {
  const detectedTemplate = detectInvestmentTemplate(input.workbook);

  if (detectedTemplate.id === "unknown") {
    throw new Error(detectedTemplate.reason);
  }

  const parser = providerParsers[detectedTemplate.id];

  return {
    detectedTemplate,
    preview: parser.parse(input.workbook),
  };
}
