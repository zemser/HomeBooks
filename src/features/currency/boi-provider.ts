import { createHash } from "node:crypto";
import Big from "big.js";
import { parse } from "csv-parse/sync";
import {
  BOI_MONTHLY_SOURCE_PREFIX,
  BOI_QUOTED_UNIT_EXPONENT,
  canonicalFxKey,
} from "./rate-keys";

const endpoint =
  "https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/";

export async function fetchBoiMonthlyRates(
  currency: string,
  yearMonths: readonly string[],
  fetchCsv: (url: URL, init: RequestInit) => Promise<Response> = fetch,
) {
  const months = [...new Set(yearMonths)].sort();
  const currentMonth = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  if (
    !months.length ||
    months.some(
      (yearMonth) =>
        !canonicalFxKey({
          baseCurrency: currency,
          quoteCurrency: "ILS",
          yearMonth,
        }) || yearMonth.slice(0, 7) >= currentMonth,
    )
  )
    throw new Error("Expected completed Bank of Israel observation months");
  const lastDate = new Date(months[months.length - 1]);
  lastDate.setUTCMonth(lastDate.getUTCMonth() + 1, 0);
  const seriesCode = `RER_${currency}_ILS`;
  async function aggregate(calculation: "mean" | "count") {
    const url = new URL(seriesCode, endpoint);
    url.search = new URLSearchParams({
      format: "csv",
      normalisefreq: `M;${calculation}`,
      startperiod: months[0],
      endperiod: lastDate.toISOString().slice(0, 10),
    }).toString();
    const res = await fetchCsv(url, {
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok || !res.headers.get("content-type")?.includes("text/csv"))
      throw new Error(
        `Bank of Israel returned HTTP ${res.status} without usable CSV`,
      );
    const records: Record<string, string>[] = parse(await res.text(), {
      columns: true,
      bom: true,
      skip_empty_lines: true,
    });
    const values = new Map<string, Big>();
    for (const row of records) {
      const month = `${row.TIME_PERIOD}-01`;
      if (
        row.SERIES_CODE !== seriesCode ||
        row.FREQ !== "M" ||
        row.BASE_CURRENCY !== currency ||
        row.COUNTER_CURRENCY !== "ILS" ||
        row.UNIT_MEASURE !== "ILS" ||
        row.DATA_TYPE !== "OF00" ||
        row.DATA_SOURCE !== "BOI_MRKT" ||
        row.UNIT_MULT !== String(BOI_QUOTED_UNIT_EXPONENT[currency]) ||
        !months.includes(month) ||
        values.has(month) ||
        !/^\d+(\.\d+)?$/.test(row.OBS_VALUE)
      ) {
        throw new Error("Unexpected Bank of Israel monthly observation");
      }
      const value = new Big(row.OBS_VALUE);
      if (
        !value.gt(0) ||
        (calculation === "count" && (!value.eq(value.round(0)) || value.gt(31)))
      ) {
        throw new Error("Invalid Bank of Israel monthly aggregate");
      }
      values.set(month, value);
    }
    if (values.size !== months.length)
      throw new Error("Incomplete Bank of Israel monthly series");
    return values;
  }
  const [means, counts] = await Promise.all([
    aggregate("mean"),
    aggregate("count"),
  ]);
  return months.map((yearMonth) => {
    const mean = means.get(yearMonth)!;
    const observationCount = counts.get(yearMonth)!.toNumber();
    const averageRate = mean
      .div(new Big(10).pow(BOI_QUOTED_UNIT_EXPONENT[currency]))
      .toFixed(8);
    if (!new Big(averageRate).gt(0))
      throw new Error("Bank of Israel rate below supported precision");
    const version = createHash("sha256")
      .update(
        [seriesCode, yearMonth, mean.toString(), observationCount].join("|"),
      )
      .digest("hex");
    return {
      baseCurrency: currency,
      quoteCurrency: "ILS",
      yearMonth,
      averageRate,
      seriesCode,
      observationCount,
      provider: "BOI",
      calculationVersion: "official-monthly-mean-v1",
      sourceName: BOI_MONTHLY_SOURCE_PREFIX + version,
    };
  });
}
