import { sql } from "drizzle-orm";
import type { DbExecutor } from "@/db";
import { canonicalFxKey, type FxRateKey } from "./rate-keys";

export async function requestMissingFxRates(
  db: DbExecutor,
  keys: readonly FxRateKey[],
) {
  const distinct = new Map<string, FxRateKey>();
  for (const key of keys) {
    const canonical = canonicalFxKey(key);
    if (canonical)
      distinct.set(canonical.baseCurrency + canonical.yearMonth, canonical);
  }
  if (!distinct.size) return;
  await db.execute(
    sql`select app.request_missing_fx_rates(${JSON.stringify([...distinct.values()])}::jsonb)`,
  );
  if (process.env.FX_WORKER_DATABASE_URL) {
    // Next dispatch runs after the enclosing request transaction has committed.
    // The cron also drains work submitted by CLI jobs or a terminated request.
    const { after } = await import("next/server");
    try {
      after(async () => {
        const { runFxWorker } = await import("./rate-worker");
        await runFxWorker();
      });
    } catch {
      // CLI jobs have no Next request context.
    }
  }
}
