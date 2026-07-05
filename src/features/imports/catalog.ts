import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { fileKindEnum, importSources, importTemplates } from "@/db/schema";
import type { DetectedTemplateId } from "@/features/imports/types";

type SupportedBankTemplateId = Exclude<DetectedTemplateId, "unknown">;
type ImportCatalogTemplate = {
  sourceName: string;
  templateId: SupportedBankTemplateId;
  fileKind: typeof fileKindEnum.enumValues[number];
  countryCode: string;
};

export const SUPPORTED_BANK_TEMPLATES: ImportCatalogTemplate[] = [
  {
    sourceName: "Max",
    templateId: "max_credit_statement",
    fileKind: "xlsx",
    countryCode: "IL",
  },
  {
    sourceName: "Cal",
    templateId: "cal_card_export",
    fileKind: "xlsx",
    countryCode: "IL",
  },
  {
    sourceName: "Cal",
    templateId: "cal_recent_transactions_report",
    fileKind: "xlsx",
    countryCode: "IL",
  },
];

export type SupportedImportTemplateRecord = {
  sourceId: string;
  templateId: string;
  sourceName: string;
  templateName: SupportedBankTemplateId;
};

export async function getSupportedBankImportCatalog() {
  const db = getDb();
  const templateMap = new Map<SupportedBankTemplateId, SupportedImportTemplateRecord>();

  for (const definition of SUPPORTED_BANK_TEMPLATES) {
    const source = await db.query.importSources.findFirst({
      where: and(
        eq(importSources.type, "bank"),
        eq(importSources.name, definition.sourceName),
      ),
    });

    if (!source) {
      throw new Error(
        `Missing seeded bank import source "${definition.sourceName}". Run the catalog seed migration before saving imports.`,
      );
    }

    const template = await db.query.importTemplates.findFirst({
      where: and(
        eq(importTemplates.importSourceId, source.id),
        eq(importTemplates.templateName, definition.templateId),
        eq(importTemplates.active, true),
      ),
    });

    if (!template) {
      throw new Error(
        `Missing seeded bank import template "${definition.templateId}". Run the catalog seed migration before saving imports.`,
      );
    }

    templateMap.set(definition.templateId, {
      sourceId: source.id,
      templateId: template.id,
      sourceName: source.name,
      templateName: definition.templateId,
    });
  }

  return templateMap;
}
