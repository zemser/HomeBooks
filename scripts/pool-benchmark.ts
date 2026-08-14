import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const poolSizes = parseList(process.env.POOL_BENCHMARK_SIZES ?? "1,2,3");
const coldRuns = process.env.POOL_BENCHMARK_COLD_RUNS ?? "1";
const warmRuns = process.env.POOL_BENCHMARK_WARM_RUNS ?? "2";
const outputPath = process.env.POOL_BENCHMARK_OUTPUT ?? "output/performance/tuning-002-pool-latest.json";

function parseList(value: string) {
  const values = value.split(",").map((item) => Number(item.trim()));
  if (values.length === 0 || values.some((item) => !Number.isInteger(item) || item < 1)) {
    throw new Error("POOL_BENCHMARK_SIZES must be a comma-separated list of positive integers.");
  }
  return values;
}

async function main() {
  const results = [];

  for (const poolSize of poolSizes) {
    const childOutput = `output/performance/tuning-002-pool-${poolSize}.json`;
    const result = spawnSync("npm", ["run", "perf:benchmark"], {
      env: {
        ...process.env,
        FINAPP_DB_POOL_MAX: String(poolSize),
        PERF_COLD_RUNS: coldRuns,
        PERF_WARM_RUNS: warmRuns,
        PERF_OUTPUT: childOutput,
      },
      stdio: "inherit",
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Pool-size benchmark failed for FINAPP_DB_POOL_MAX=${poolSize}.`);
    }

    results.push(JSON.parse(await readFile(childOutput, "utf8")));
  }

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    poolSizes,
    coldRuns: Number(coldRuns),
    warmRuns: Number(warmRuns),
    notes: [
      "Each pool size runs the existing local production benchmark against the same database workload.",
      "This measures application latency and pool wait telemetry; hosted Supavisor pressure still requires a hosted run.",
    ],
    results,
  };

  const directory = outputPath.slice(0, outputPath.lastIndexOf("/"));
  if (directory) await mkdir(directory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
