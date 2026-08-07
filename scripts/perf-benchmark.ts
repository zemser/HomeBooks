import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import process from "node:process";
import { setTimeout as wait } from "node:timers/promises";

import { chromium, type Browser, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

const baseURL = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3102";
const port = Number(new URL(baseURL).port || 3102);
const coldRuns = Number(process.env.PERF_COLD_RUNS ?? 2);
const warmRuns = Number(process.env.PERF_WARM_RUNS ?? 5);
const routes = ["/", "/imports", "/imports/review", "/expenses", "/reports"] as const;

type TelemetryRecord = {
  operation?: string;
  status?: "ok" | "error";
  durationMs?: number;
  counts?: Record<string, number>;
};

type Sample = {
  scenario: string;
  mode: "cold" | "warm";
  run: number;
  status: "ok" | "skipped" | "error";
  durationMs: number;
  navigation?: { domContentLoadedMs: number; loadMs: number; responseStartMs: number };
  telemetry: { records: number; durationMs: number; counts: Record<string, number> };
  note?: string;
};

const telemetryRecords: TelemetryRecord[] = [];
let server: ChildProcess | undefined;

function localEnv() {
  return {
    ...process.env,
    DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:54322/postgres",
    DIRECT_DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:54322/postgres",
    FINAPP_AUTH_MODE: "dev",
    FINAPP_IMPORT_STORAGE: "local",
    PORT: String(port),
    FINAPP_PERF_LOG: "1",
  };
}

function startProductionServer() {
  server = spawn("npm", ["run", "start", "--", "--port", String(port)], {
    env: localEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const readLine = (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      try {
        const value = JSON.parse(line) as TelemetryRecord;
        if (value.operation || value.counts) telemetryRecords.push(value);
      } catch {
        // Keep non-JSON Next.js startup output out of the benchmark records.
      }
    }
  };
  server.stdout?.on("data", readLine);
  server.stderr?.on("data", readLine);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseURL}/`);
      if (response.status < 500) return;
    } catch {
      // The production server is still starting.
    }
    await wait(500);
  }
  throw new Error(`Production server did not become ready at ${baseURL}.`);
}

function sumTelemetry(records: TelemetryRecord[]) {
  const counts: Record<string, number> = {};
  let durationMs = 0;
  for (const record of records) {
    durationMs += record.durationMs ?? 0;
    for (const [name, value] of Object.entries(record.counts ?? {})) {
      counts[name] = (counts[name] ?? 0) + value;
    }
  }
  return { records: records.length, durationMs: Number(durationMs.toFixed(2)), counts };
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await wait(75);
}

async function navigationMetrics(page: Page) {
  return page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return entry
      ? {
          domContentLoadedMs: Number(entry.domContentLoadedEventEnd.toFixed(2)),
          loadMs: Number(entry.loadEventEnd.toFixed(2)),
          responseStartMs: Number(entry.responseStart.toFixed(2)),
        }
      : undefined;
  });
}

async function measureNavigation(
  page: Page,
  scenario: string,
  mode: Sample["mode"],
  run: number,
  action: () => Promise<void>,
): Promise<Sample> {
  const telemetryStart = telemetryRecords.length;
  const startedAt = performance.now();
  try {
    await action();
    await settle(page);
    return {
      scenario,
      mode,
      run,
      status: "ok",
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      navigation: await navigationMetrics(page),
      telemetry: sumTelemetry(telemetryRecords.slice(telemetryStart)),
    };
  } catch (error) {
    return {
      scenario,
      mode,
      run,
      status: "error",
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      telemetry: sumTelemetry(telemetryRecords.slice(telemetryStart)),
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

async function hardNavigationSamples(browser: Browser) {
  const samples: Sample[] = [];
  for (let run = 1; run <= coldRuns; run += 1) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    for (const route of routes) {
      samples.push(await measureNavigation(page, `hard:${route}`, "cold", run, () => page.goto(`${baseURL}${route}`).then(() => undefined)));
    }
    await context.close();
  }

  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto(`${baseURL}/`);
  for (let run = 1; run <= warmRuns; run += 1) {
    for (const route of routes) {
      samples.push(await measureNavigation(page, `hard:${route}`, "warm", run, () => page.goto(`${baseURL}${route}`).then(() => undefined)));
    }
  }
  await context.close();
  return samples;
}

async function softNavigationSamples(browser: Browser) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const samples: Sample[] = [];
  for (let run = 1; run <= warmRuns; run += 1) {
    await page.goto(`${baseURL}/`);
    for (const route of routes.slice(1)) {
      samples.push(
        await measureNavigation(page, `soft:/:${route}`, "warm", run, async () => {
          await Promise.all([page.waitForURL(new RegExp(`${route.replaceAll("/", "\\/")}$`)), page.locator(`a[href="${route}"]`).first().click()]);
        }),
      );
      await page.goto(`${baseURL}/`);
    }
  }
  await context.close();
  return samples;
}

type ReviewData = { queue: Array<{ id: string }>; categoryCatalog: Array<{ id: string }> };

async function mutationSample(page: Page, scenario: string, run: number, action: () => Promise<string | undefined>) {
  const telemetryStart = telemetryRecords.length;
  const startedAt = performance.now();
  try {
    const note = await action();
    return {
      scenario,
      mode: "warm" as const,
      run,
      status: note ? "ok" as const : "skipped" as const,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      telemetry: sumTelemetry(telemetryRecords.slice(telemetryStart)),
      ...(note ? { note } : {}),
    } satisfies Sample;
  } catch (error) {
    return {
      scenario,
      mode: "warm" as const,
      run,
      status: "error" as const,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      telemetry: sumTelemetry(telemetryRecords.slice(telemetryStart)),
      note: error instanceof Error ? error.message : String(error),
    } satisfies Sample;
  }
}

async function mutationSamples(browser: Browser) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto(`${baseURL}/imports/review`);
  const response = await page.request.get("/api/imports/review?page=1&pageSize=10");
  const review = (await response.json()) as ReviewData;
  const categoryId = review.categoryCatalog[0]?.id;
  const queueIds = review.queue.slice(0, 2).map((item) => item.id);
  const samples: Sample[] = [];

  samples.push(await mutationSample(page, "save-one", 1, async () => {
    const transactionId = queueIds[0];
    if (!transactionId || !categoryId) return undefined;
    const result = await page.request.post("/api/transaction-classifications", {
      data: { transactionId, classificationType: "household", categoryId, category: null, memberOwnerId: null, createRule: false, additionalTransactionIds: [] },
    });
    if (!result.ok()) throw new Error(`save-one returned ${result.status()}`);
    const payload = (await result.json()) as { undoBatchId?: string };
    if (payload.undoBatchId) await page.request.post("/api/transaction-classifications/undo", { data: { batchId: payload.undoBatchId } });
    return "one classification, then undo";
  }));

  samples.push(await mutationSample(page, "save-bulk", 1, async () => {
    if (queueIds.length === 0 || !categoryId) return undefined;
    const result = await page.request.post("/api/transaction-classifications/bulk", {
      data: { transactionIds: queueIds, classificationType: "household", categoryId, category: null, memberOwnerId: null },
    });
    if (!result.ok()) throw new Error(`save-bulk returned ${result.status()}`);
    const payload = (await result.json()) as { undoBatchId?: string };
    if (payload.undoBatchId) await page.request.post("/api/transaction-classifications/undo", { data: { batchId: payload.undoBatchId } });
    return `${queueIds.length} classifications, then undo`;
  }));

  samples.push(await mutationSample(page, "small-import-preview", 1, async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["PERF-002 benchmark"],
      ["ניסוי מדידה"],
      ["2026-08-01"],
      ["תאריך\nעסקה", "שם בית עסק", "סכום\nעסקה", "סכום\nחיוב", "סוג\nעסקה", "קטגוריה", "הערות"],
      ["2026-08-01", "PERF-002 benchmark", 12.34, 12.34, "רגילה", "", ""],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const result = await page.request.post("/api/imports/preview", {
      multipart: { workspaceCurrency: "ILS", file: { name: "perf-002-small.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer } },
    });
    if (!result.ok()) throw new Error(`small-import-preview returned ${result.status()}`);
    return "one-row bank workbook preview; no data persisted";
  }));
  await context.close();
  return samples;
}

async function main() {
  const build = spawnSync("npm", ["run", "build"], { env: localEnv(), stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
  startProductionServer();
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const samples = [
      ...(await hardNavigationSamples(browser)),
      ...(await softNavigationSamples(browser)),
      ...(await mutationSamples(browser)),
    ];
    const output = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      baseURL,
      node: process.version,
      next: "16.3.0",
      runs: { cold: coldRuns, warm: warmRuns },
      notes: ["Telemetry is parsed from allowlisted server logs.", "Import scenario previews a one-row workbook and does not persist data."],
      samples,
    };
    const outputPath = process.env.PERF_OUTPUT ?? "output/performance/perf-002-latest.json";
    await mkdir(outputPath.substring(0, outputPath.lastIndexOf("/")), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    await browser.close();
    const runningServer = server;
    runningServer?.kill("SIGTERM");
    if (runningServer) await once(runningServer, "exit").catch(() => undefined);
  }
}

main().catch((error) => {
  server?.kill("SIGTERM");
  console.error(error);
  process.exitCode = 1;
});
