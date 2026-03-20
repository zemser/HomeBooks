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

const SUPPORTED_BANK_TEMPLATES: ImportCatalogTemplate[] = [
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

export async function ensureSupportedBankImportCatalog() {
  const db = getDb();
  const templateMap = new Map<SupportedBankTemplateId, SupportedImportTemplateRecord>();

  for (const definition of SUPPORTED_BANK_TEMPLATES) {
    let source = await db.query.importSources.findFirst({
      where: and(
        eq(importSources.type, "bank"),
        eq(importSources.name, definition.sourceName),
      ),
    });

    if (!source) {
      [source] = await db
        .insert(importSources)
        .values({
          type: "bank",
          name: definition.sourceName,
          countryCode: definition.countryCode,
        })
        .returning();
    }

    let template = await db.query.importTemplates.findFirst({
      where: and(
        eq(importTemplates.importSourceId, source.id),
        eq(importTemplates.templateName, definition.templateId),
      ),
    });

    if (!template) {
      [template] = await db
        .insert(importTemplates)
        .values({
          importSourceId: source.id,
          templateName: definition.templateId,
          fileKind: definition.fileKind,
          headerMappingJson: {},
        })
        .returning();
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
