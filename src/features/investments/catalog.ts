import { and, eq } from "drizzle-orm";

import { getDb, type DbExecutor } from "@/db";
import { importSources } from "@/db/schema";

export type SupportedInvestmentSourceRecord = {
  sourceId: string;
  sourceName: string;
};

export const EXCELLENCE_INVESTMENT_SOURCE = {
  sourceName: "Excellence",
  countryCode: "IL",
} as const;

export async function getExcellenceInvestmentImportSource(
  db: DbExecutor = getDb(),
): Promise<SupportedInvestmentSourceRecord> {

  const source = await db.query.importSources.findFirst({
    where: and(
      eq(importSources.type, "investment"),
      eq(importSources.name, EXCELLENCE_INVESTMENT_SOURCE.sourceName),
    ),
  });

  if (!source) {
    throw new Error(
      "Missing seeded Excellence investment source. Run the catalog seed migration before saving investment imports.",
    );
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
  };
}
