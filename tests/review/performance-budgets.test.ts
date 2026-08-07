import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PERF-003 budget artifact covers web vitals, durations, amplification, and route JS", async () => {
  const budgets = JSON.parse(await readFile("docs/performance-budgets-perf-003.json", "utf8")) as {
    schemaVersion: number;
    regression: { durationMultiplier: number; counterMultiplier: number };
    coreWebVitalsP75: { lcpMs: number; inpMs: number; cls: number };
    serverDurationMs: Record<string, unknown>;
    amplification: Record<string, unknown>;
    clientJavaScriptFirstLoadKbMax: Record<string, number>;
  };

  assert.equal(budgets.schemaVersion, 1);
  assert.equal(budgets.regression.durationMultiplier, 1.2);
  assert.equal(budgets.regression.counterMultiplier, 1.2);
  assert.deepEqual(budgets.coreWebVitalsP75, { lcpMs: 2500, inpMs: 200, cls: 0.1 });
  assert.ok(budgets.serverDurationMs.hardNavigation);
  assert.ok(budgets.serverDurationMs.softNavigation);
  assert.ok(budgets.serverDurationMs.reads);
  assert.ok(budgets.serverDurationMs.mutations);
  assert.equal(budgets.amplification.protectedRead !== undefined, true);
  assert.equal(budgets.amplification.routeSqlStatementsMax !== undefined, true);
  assert.deepEqual(Object.keys(budgets.clientJavaScriptFirstLoadKbMax).sort(), ["/", "/expenses", "/imports", "/imports/review", "/reports", "shared"]);
});
