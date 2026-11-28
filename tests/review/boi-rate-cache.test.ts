import assert from "node:assert/strict";
import test from "node:test";
import { fetchBoiMonthlyRates } from "@/features/currency/boi-provider";
import { canonicalFxKey } from "@/features/currency/rate-keys";

const header =
  "SERIES_CODE,FREQ,BASE_CURRENCY,COUNTER_CURRENCY,UNIT_MEASURE,DATA_TYPE,DATA_SOURCE,TIME_COLLECT,CONF_STATUS,PUB_WEBSITE,UNIT_MULT,COMMENTS,TIME_PERIOD,OBS_VALUE,RELEASE_STATUS";
const row =
  "RER_JPY_ILS,M,JPY,ILS,ILS,OF00,BOI_MRKT,V,F,Y,2,,2025-01,2.311563636,";
const usd =
  "RER_USD_ILS,M,USD,ILS,ILS,OF00,BOI_MRKT,V,F,Y,0,,2025-01,3.615272727,";
const months = ["2025-01-01"];
function provider(body: string, count = "22") {
  return async (url: URL) => {
    assert.equal(url.searchParams.get("endperiod"), "2025-01-31");
    const aggregate = url.searchParams.get("normalisefreq");
    assert.ok(aggregate === "M;mean" || aggregate === "M;count");
    return new Response(
      [
        header,
        aggregate === "M;mean" ? body : body.replace(/,[\d.]+,$/, `,${count},`),
      ].join("\n"),
      { headers: { "content-type": "text/csv" } },
    );
  };
}

test("official January means match the seed per dollar and per single yen", async () => {
  for (const [currency, body, expected] of [
    ["JPY", row, "0.02311564"],
    ["USD", usd, "3.61527273"],
  ]) {
    const [result] = await fetchBoiMonthlyRates(
      currency,
      months,
      provider(body),
    );
    assert.equal(result.averageRate, expected);
    assert.equal(result.observationCount, 22);
  }
});
test("unpublished months, swapped units, wrong series, duplicate or truncated observations fail closed", async () => {
  for (const bad of [
    "",
    row.replace(",2,,", ",0,,"),
    usd,
    row + "\n" + row,
    row.replace(",2.311563636,", ","),
    row.replace("2025-01", "2025-02"),
  ]) {
    await assert.rejects(fetchBoiMonthlyRates("JPY", months, provider(bad)));
  }
  await assert.rejects(fetchBoiMonthlyRates("JPY", months, provider(row, "0")));
  await assert.rejects(
    fetchBoiMonthlyRates(
      "JPY",
      months,
      async () => new Response("", { status: 503 }),
    ),
  );
});
test("key canonicalization converges inverse demands and rejects invalid dates and unsupported pairs", () => {
  assert.deepEqual(
    canonicalFxKey({
      baseCurrency: "ILS",
      quoteCurrency: "JPY",
      yearMonth: months[0],
    }),
    { baseCurrency: "JPY", quoteCurrency: "ILS", yearMonth: months[0] },
  );
  for (const [base, quote, month] of [
    ["EUR", "USD", months[0]],
    ["JPY", "ILS", "2025-13-01"],
    ["ILS", "ILS", months[0]],
  ]) {
    assert.equal(
      canonicalFxKey({
        baseCurrency: base,
        quoteCurrency: quote,
        yearMonth: month,
      }),
      null,
    );
  }
});

test(
  "durable cache retries an outage then retries repair independently with the restricted worker",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { sql } = await import("drizzle-orm");
    const schema = await import("@/db/schema");
    const { requestMissingFxRates } =
      await import("@/features/currency/rate-requests");
    const { drainFxRateRequests } =
      await import("@/features/currency/rate-worker");
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    const key = {
      baseCurrency: "JPY",
      quoteCurrency: "ILS",
      yearMonth: "2025-01-01",
    };
    const rollback = Error("rollback");
    try {
      await assert.rejects(
        db.transaction(async (tx) => {
          await tx.execute(
            sql`delete from public.exchange_rate_monthly where base_currency='JPY' and year_month='2025-01-01'`,
          );
          await requestMissingFxRates(tx, [key, key]);
          await requestMissingFxRates(tx, [
            { ...key, baseCurrency: "ILS", quoteCurrency: "JPY" },
          ]);
          await tx.execute(sql`set local role homebooks_fx_worker`);
          let fetchCalls = 0;
          let repairCalls = 0;
          const options = {
            fetchRates: async () => {
              if (++fetchCalls === 1) throw new Error("offline");
              return fetchBoiMonthlyRates("JPY", months, provider(row));
            },
            repair: async () => {
              if (++repairCalls === 1)
                throw new Error("household write interrupted");
            },
          };
          const run = () => drainFxRateRequests(tx, options);
          const due = () =>
            tx.execute(
              sql`update fx_rate_requests set available_at=now() where base_currency='JPY' and year_month='2025-01-01'`,
            );
          assert.equal((await run()).lastFailure, "offline");
          assert.equal((await run()).claimed, 0);
          await due();
          assert.equal(
            (await run()).lastFailure,
            "household write interrupted",
          );
          await due();
          assert.equal((await run()).pending, 0);
          assert.equal((await run()).claimed, 0);
          assert.equal(fetchCalls, 2);
          assert.equal(repairCalls, 2);
          const saved = (
            await tx.execute(
              sql`select average_rate,observation_count from exchange_rate_monthly where base_currency='JPY' and year_month='2025-01-01'`,
            )
          ).rows;
          assert.deepEqual(saved, [
            { average_rate: "0.02311564", observation_count: 22 },
          ]);
          throw rollback;
        }),
        (error) => error === rollback,
      );
    } finally {
      await pool.end();
    }
  },
);
