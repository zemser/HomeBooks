import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { DbExecutor } from "@/db";
import * as schema from "@/db/schema";
import { fetchBoiMonthlyRates } from "./boi-provider";
import {
  BOI_MONTHLY_SOURCE_PREFIX,
  canonicalFxKey,
  type FxRateKey,
} from "./rate-keys";
import { SEED_BOI_MONTHLY_AVERAGE_SOURCE } from "./seed-boi-monthly-averages";

type Claim = FxRateKey & {
  id: string;
  phase: "fetch" | "refresh" | "repair";
  attempts: number;
  cached: boolean;
};
type Repair = (db: DbExecutor, key: FxRateKey) => Promise<unknown>;
type WorkerOptions = {
  fetchRates: typeof fetchBoiMonthlyRates;
  repair: Repair;
};

function groupAdjacent(claims: Claim[]) {
  const groups: Claim[][] = [];
  for (const claim of claims.sort(
    (a, b) =>
      a.baseCurrency.localeCompare(b.baseCurrency) ||
      a.yearMonth.localeCompare(b.yearMonth),
  )) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    if (
      previous &&
      group &&
      previous.attempts === 0 &&
      claim.attempts === 0 &&
      previous.baseCurrency === claim.baseCurrency
    ) {
      const nextMonth = new Date(previous.yearMonth);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      if (nextMonth.toISOString().slice(0, 10) === claim.yearMonth) {
        group.push(claim);
        continue;
      }
    }
    groups.push([claim]);
  }
  return groups;
}

export async function drainFxRateRequests(
  db: DbExecutor,
  options: WorkerOptions,
) {
  const lease = randomUUID();
  const { rows } = await db.execute<Claim>(sql`
    with batch as (
      select id from public.fx_rate_requests where available_at <= now()
      order by available_at, year_month, base_currency limit 8 for update skip locked
    )
    update public.fx_rate_requests r set lease=${lease}, available_at=now()+interval '5 minutes'
    from batch where r.id=batch.id
    returning r.id,r.base_currency as "baseCurrency",r.quote_currency as "quoteCurrency",
      r.year_month::text as "yearMonth",r.phase,r.attempts, exists (
        select from public.exchange_rate_monthly c where (c.base_currency,c.quote_currency,c.year_month)
          =(r.base_currency,r.quote_currency,r.year_month) and c.average_rate>0
          and (starts_with(c.source_name,${BOI_MONTHLY_SOURCE_PREFIX}) or c.source_name=${SEED_BOI_MONTHLY_AVERAGE_SOURCE})
      ) as cached
  `);

  async function retry(id: string, error: unknown) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "FX worker failed";
    await db.execute(sql`update public.fx_rate_requests set attempts=attempts+1, lease=null,
      available_at=now()+ interval '1 minute' * power(2,least(attempts,10)),last_error=${message}, failed_at=now()
      where id=${id} and lease=${lease}`);
  }
  let repaired = 0;
  async function repair(row: Claim) {
    try {
      await options.repair(db, {
        baseCurrency: row.baseCurrency,
        quoteCurrency: row.quoteCurrency,
        yearMonth: row.yearMonth,
      });
      await db.transaction(async (tx) => {
        // Lock before clearing: a competing enqueue either marks this claim or inserts the next one.
        const deleted =
          await tx.execute(sql`delete from public.fx_rate_requests where id=${row.id} and lease=${lease}
          and not requested_during_repair returning id`);
        if (!deleted.rowCount) {
          await tx.execute(sql`update public.fx_rate_requests set lease=null,requested_during_repair=false,
            attempts=0,last_error=null,failed_at=null,available_at=now() where id=${row.id} and lease=${lease}`);
        }
      });
      repaired++;
    } catch (error) {
      await retry(row.id, error);
    }
  }
  for (const group of groupAdjacent(
    rows.filter(
      (row) =>
        row.phase === "refresh" || (row.phase === "fetch" && !row.cached),
    ),
  )) {
    try {
      const rates = await options.fetchRates(
        group[0].baseCurrency,
        group.map((row) => row.yearMonth),
      );
      await db.transaction(async (tx) => {
        for (const row of group) {
          const rate = rates.find((rate) => rate.yearMonth === row.yearMonth);
          if (!rate) throw new Error("Incomplete Bank of Israel batch");
          const advanced =
            await tx.execute(sql`update public.fx_rate_requests set phase='repair',attempts=0,
            last_error=null,failed_at=null where id=${row.id} and lease=${lease} returning id`);
          if (!advanced.rowCount) continue;
          if (row.phase === "refresh") {
            const previous = (
              await tx.execute<{
                source_name: string;
              }>(sql`select source_name from public.exchange_rate_monthly
              where base_currency=${row.baseCurrency} and quote_currency=${row.quoteCurrency} and year_month=${row.yearMonth}
                and starts_with(source_name,${BOI_MONTHLY_SOURCE_PREFIX})
              order by fetched_at desc,id desc limit 1`)
            ).rows[0];
            if (previous?.source_name.split("/")[0] === rate.sourceName)
              continue;
            // A return to an earlier published value is a new revision, too.
            rate.sourceName += "/" + lease;
          }
          await tx
            .insert(schema.exchangeRateMonthly)
            .values(rate)
            .onConflictDoNothing();
        }
      });
      for (const row of group) await repair(row);
    } catch (error) {
      for (const row of group) await retry(row.id, error);
    }
  }
  for (const row of rows.filter(
    (row) => row.phase === "repair" || (row.phase === "fetch" && row.cached),
  )) {
    if (row.phase === "fetch") {
      await db.execute(
        sql`update public.fx_rate_requests set phase='repair', attempts=0 where id=${row.id} and lease=${lease}`,
      );
    }
    await repair(row);
  }
  const [status] = (
    await db.execute<{pending: number; oldestMonth: string | null; lastFailure: string | null}>(sql`select count(*)::int as pending, min(year_month)::text as "oldestMonth",
    (array_agg(last_error order by failed_at desc) filter (where last_error is not null))[1] as "lastFailure"
    from public.fx_rate_requests`)
  ).rows;
  return { claimed: rows.length, repaired, ...status };
}

let workerPool: Pool | undefined;
export async function runFxWorker(refresh?: FxRateKey) {
  const url = process.env.FX_WORKER_DATABASE_URL;
  if (!url) throw new Error("FX_WORKER_DATABASE_URL is required");
  // This role has cache INSERT and queue access, with no household table grants.
  workerPool ??= new Pool({
    connectionString: url,
    max: 2,
    options: "-c role=homebooks_fx_worker",
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  });
  const db = drizzle(workerPool, { schema });
  if (refresh) {
    const key = canonicalFxKey(refresh);
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (!key || key.yearMonth.slice(0, 7) >= currentMonth)
      throw new Error("Expected a supported pair and completed month");
    await db.execute(sql`insert into public.fx_rate_requests(base_currency,quote_currency,year_month,phase)
      values (${key.baseCurrency},${key.quoteCurrency},${key.yearMonth},'refresh')
      on conflict (base_currency,quote_currency,year_month) do nothing`);
  }
  const { reconcilePendingFxForRate } = await import("./backfill-imported-fx");
  const options = {
    fetchRates: fetchBoiMonthlyRates,
    repair: reconcilePendingFxForRate,
  };
  const deadline = Date.now() + 60_000;
  let claimed = 0;
  let repaired = 0;
  let status;
  do {
    status = await drainFxRateRequests(db, options);
    claimed += status.claimed;
    repaired += status.repaired;
  } while (status.claimed === 8 && Date.now() < deadline);
  return { ...status, claimed, repaired };
}
