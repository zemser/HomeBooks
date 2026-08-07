import { readFile } from "node:fs/promises";
import process from "node:process";

type JsonObject = Record<string, unknown>;

const budgetPath = process.env.PERF_BUDGETS ?? "docs/performance-budgets-perf-003.json";
const inputPath = process.env.PERF_INPUT ?? "docs/performance-baseline-perf-002.json";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNumber(value: unknown, path: string, errors: string[]) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) errors.push(`${path} must be a non-negative number`);
}

function assertRequiredNumbers(value: unknown, path: string, fields: string[], errors: string[]) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  for (const field of fields) assertNumber(value[field], `${path}.${field}`, errors);
}

function validateBudgets(budgets: JsonObject) {
  const errors: string[] = [];
  if (budgets.schemaVersion !== 1) errors.push("schemaVersion must be 1");

  const regression = budgets.regression;
  assertRequiredNumbers(regression, "regression", ["durationMultiplier", "durationAbsoluteMs", "counterMultiplier", "clientJavaScriptMultiplier"], errors);
  const cwv = budgets.coreWebVitalsP75;
  assertRequiredNumbers(cwv, "coreWebVitalsP75", ["lcpMs", "inpMs", "cls"], errors);

  const durations = budgets.serverDurationMs;
  if (!isObject(durations)) errors.push("serverDurationMs must be an object");
  else {
    const hardNavigation = durations.hardNavigation;
    if (!isObject(hardNavigation)) errors.push("serverDurationMs.hardNavigation must be an object");
    else for (const [scenario, target] of Object.entries(hardNavigation)) {
      assertRequiredNumbers(target, `serverDurationMs.hardNavigation.${scenario}`, ["warmP50", "warmP95", "coldP95"], errors);
    }
    for (const name of ["softNavigation", "reads"] as const) {
      const target = durations[name];
      assertRequiredNumbers(target, `serverDurationMs.${name}`, ["warmP50", "warmP95"], errors);
      if (name === "reads" && isObject(target)) assertNumber(target.coldP95, "serverDurationMs.reads.coldP95", errors);
    }
    const mutations = durations.mutations;
    if (!isObject(mutations)) errors.push("serverDurationMs.mutations must be an object");
    else for (const [scenario, target] of Object.entries(mutations)) {
      assertRequiredNumbers(target, `serverDurationMs.mutations.${scenario}`, ["warmP50", "warmP95", "coldP95"], errors);
    }
  }

  const amplification = budgets.amplification;
  if (!isObject(amplification)) errors.push("amplification must be an object");
  else {
    assertRequiredNumbers(amplification.protectedRead, "amplification.protectedRead", ["authCallsMax", "workspaceLookupsMax", "rlsSetupsMax", "reportingWritesOnGetMax"], errors);
    assertRequiredNumbers(amplification.routeSqlStatementsMax, "amplification.routeSqlStatementsMax", ["/", "/imports", "/imports/review", "/expenses", "/reports"], errors);
    assertRequiredNumbers(amplification.routeDatabaseUnitsMax, "amplification.routeDatabaseUnitsMax", ["/", "/imports", "/imports/review", "/expenses", "/reports"], errors);
    assertNumber(amplification.bulkSaveSqlStatementsMax, "amplification.bulkSaveSqlStatementsMax", errors);
    assertNumber(amplification.steadyStateAdvisoryLockCallsMax, "amplification.steadyStateAdvisoryLockCallsMax", errors);
  }

  assertRequiredNumbers(budgets.clientJavaScriptFirstLoadKbMax, "clientJavaScriptFirstLoadKbMax", ["shared", "/", "/imports", "/imports/review", "/expenses", "/reports"], errors);
  return errors;
}

async function main() {
  const [budgetText, inputText] = await Promise.all([readFile(budgetPath, "utf8"), readFile(inputPath, "utf8")]);
  const budgets = JSON.parse(budgetText) as JsonObject;
  const input = JSON.parse(inputText) as JsonObject;
  const errors = validateBudgets(budgets);
  if (!isObject(input) || input.schemaVersion !== 1) errors.push(`${inputPath} must be a PERF-002 schemaVersion 1 artifact`);
  if (errors.length > 0) {
    for (const error of errors) console.error(`Performance budget error: ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Performance budgets valid: ${budgetPath}`);
  console.log(`Baseline artifact accepted: ${inputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
