import { and, eq } from "drizzle-orm";

import { getDb, type DbExecutor } from "@/db";
import { importSources } from "@/db/schema";
import { INVESTMENT_PROVIDER_SOURCE_NAME } from "@/features/investments/constants";
import type { InvestmentProviderId } from "@/features/investments/types";

export type SupportedInvestmentSourceRecord = {
  sourceId: string;
  sourceName: string;
};

export const EXCELLENCE_INVESTMENT_SOURCE = {
  sourceName: INVESTMENT_PROVIDER_SOURCE_NAME.excellence,
  countryCode: "IL",
} as const;

export const BANK_INVESTMENT_SOURCE = {
  sourceName: INVESTMENT_PROVIDER_SOURCE_NAME["bank-securities"],
  countryCode: "IL",
} as const;

async function findInvestmentSource(db: DbExecutor, sourceName: string) {
  return db.query.importSources.findFirst({
    where: and(
      eq(importSources.type, "investment"),
      eq(importSources.name, sourceName),
    ),
  });
}

export async function getInvestmentImportSource(
  db: DbExecutor,
  provider: InvestmentProviderId,
): Promise<SupportedInvestmentSourceRecord> {
  const sourceName = INVESTMENT_PROVIDER_SOURCE_NAME[provider];
  let source = await findInvestmentSource(db, sourceName);

  if (!source && sourceName === BANK_INVESTMENT_SOURCE.sourceName) {
    await db
      .insert(importSources)
      .values({
        type: "investment",
        name: sourceName,
        countryCode: BANK_INVESTMENT_SOURCE.countryCode,
      })
      .onConflictDoNothing({
        target: [importSources.type, importSources.name],
      });
    source = await findInvestmentSource(db, sourceName);
  }

  if (!source) {
    throw new Error(
      `Missing seeded ${sourceName} investment source. Run the catalog seed migration before saving investment imports.`,
    );
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
  };
}

export async function getExcellenceInvestmentImportSource(
  db: DbExecutor = getDb(),
): Promise<SupportedInvestmentSourceRecord> {
  return getInvestmentImportSource(db, "excellence");
}
