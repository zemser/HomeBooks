import { setTimeout } from "node:timers/promises";
import { runFxWorker } from "../src/features/currency/rate-worker";

const refreshIndex = process.argv.indexOf("--refresh");
const refresh =
  refreshIndex < 0
    ? undefined
    : {
        baseCurrency: process.argv[refreshIndex + 1] ?? "",
        quoteCurrency: "ILS",
        yearMonth: `${process.argv[refreshIndex + 2] ?? ""}-01`,
      };
const watch = process.argv.includes("--watch") && !refresh;
do {
  try {
    const status = await runFxWorker(refresh);
    if (!watch || status.claimed) console.log("FX worker", status);
  } catch (error) {
    if (!watch) throw error;
    console.error(
      "FX worker retry",
      error instanceof Error ? error.message : error,
    );
  }
  if (watch) await setTimeout(60_000);
} while (watch);
