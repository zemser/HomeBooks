import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { importSources } from "@/db/schema";

export type SupportedInvestmentSourceRecord = {
  sourceId: string;
  sourceName: string;
};

export async function ensureExcellenceInvestmentImportSource(): Promise<SupportedInvestmentSourceRecord> {
  const db = getDb();
  const sourceName = "Excellence";

  let source = await db.query.importSources.findFirst({
    where: and(
      eq(importSources.type, "investment"),
      eq(importSources.name, sourceName),
    ),
  });

  if (!source) {
    await db
      .insert(importSources)
      .values({
        type: "investment",
        name: sourceName,
        countryCode: "IL",
      })
      .onConflictDoNothing();

    source = await db.query.importSources.findFirst({
      where: and(
        eq(importSources.type, "investment"),
        eq(importSources.name, sourceName),
      ),
    });
  }

  if (!source) {
    throw new Error("Could not resolve the Excellence investment source.");
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
  };
}
