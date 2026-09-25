import type { WorkbookData } from "@/features/imports/types";
import { detectInvestmentTemplate } from "@/features/investments/detect";
import { bankSecuritiesPreviewParser } from "@/features/investments/providers/bank-securities";
import { currentPortfolioPreviewParser } from "@/features/investments/providers/current-portfolio";
import { excellenceInvestmentPreviewParser } from "@/features/investments/providers/excellence";
import type {
  DetectedInvestmentTemplate,
  InvestmentPreviewParser,
  InvestmentPreviewResult,
  InvestmentProviderId,
} from "@/features/investments/types";

const providerParsers: Record<InvestmentProviderId, InvestmentPreviewParser> = {
  excellence: excellenceInvestmentPreviewParser,
  "current-portfolio": currentPortfolioPreviewParser,
  "bank-securities": bankSecuritiesPreviewParser,
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
