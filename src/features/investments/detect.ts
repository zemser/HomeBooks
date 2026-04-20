import type { WorkbookData } from "@/features/imports/types";
import { normalizeRow } from "@/features/imports/utils";
import {
  EXCELLENCE_ACTIVITY_HEADER,
  EXCELLENCE_HOLDINGS_HEADER,
} from "@/features/investments/constants";
import type { DetectedInvestmentTemplate } from "@/features/investments/types";
import { investmentHeaderIncludes } from "@/features/investments/utils";

export function detectInvestmentTemplate(workbook: WorkbookData): DetectedInvestmentTemplate {
  for (const sheet of workbook.sheets) {
    for (const rawRow of sheet.rows.slice(0, 40)) {
      const row = normalizeRow(rawRow);

      if (investmentHeaderIncludes(row, EXCELLENCE_HOLDINGS_HEADER)) {
        return {
          id: "excellence",
          confidence: 0.96,
          reason: `Matched Excellence holdings header in sheet "${sheet.name}"`,
        };
      }

      if (investmentHeaderIncludes(row, EXCELLENCE_ACTIVITY_HEADER)) {
        return {
          id: "excellence",
          confidence: 0.95,
          reason: `Matched Excellence activity header in sheet "${sheet.name}"`,
        };
      }
    }
  }

  return {
    id: "unknown",
    confidence: 0,
    reason: "No supported investment workbook header matched the file.",
  };
}
