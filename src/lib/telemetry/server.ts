import { AsyncLocalStorage } from "node:async_hooks";

type TelemetryValue = boolean | number | string | null;
type CounterName =
  | "authCalls"
  | "mfaCalls"
  | "databaseUnits"
  | "sqlStatements"
  | "rlsSetups"
  | "workspaceLookups"
  | "reportingProjections";

type TelemetrySpan = {
  name: string;
  durationMs: number;
  status: "ok" | "error";
  attributes?: Record<string, TelemetryValue>;
};

type TelemetryState = Record<CounterName, number> & {
  requestId: string;
  operationId: string;
  operation: string;
  startedAt: number;
  spans: TelemetrySpan[];
};

export type TelemetryOperationInput = {
  operation: string;
  requestId?: string;
  attributes?: Record<string, TelemetryValue>;
};

const telemetryStorage = new AsyncLocalStorage<TelemetryState>();

function currentTelemetry() {
  return telemetryStorage.getStore();
}

function durationSince(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}

function increment(field: CounterName) {
  const state = currentTelemetry();
  if (state) state[field] += 1;
}

export function recordAuthCall() {
  increment("authCalls");
}

export function recordMfaCall() {
  increment("mfaCalls");
}

export function recordDatabaseUnit() {
  increment("databaseUnits");
}

export function recordSqlStatement() {
  increment("sqlStatements");
}

export function recordRlsSetup() {
  increment("rlsSetups");
}

export function recordWorkspaceLookup() {
  increment("workspaceLookups");
}

export function recordReportingProjection() {
  increment("reportingProjections");
}

export async function withTelemetrySpan<T>(
  name: string,
  callback: () => Promise<T>,
  attributes?: Record<string, TelemetryValue>,
) {
  const startedAt = performance.now();
  try {
    const result = await callback();
    currentTelemetry()?.spans.push({ name, durationMs: durationSince(startedAt), status: "ok", attributes });
    return result;
  } catch (error) {
    currentTelemetry()?.spans.push({ name, durationMs: durationSince(startedAt), status: "error", attributes });
    throw error;
  }
}

function buildState(input: TelemetryOperationInput): TelemetryState {
  return {
    requestId: input.requestId ?? crypto.randomUUID(),
    operationId: crypto.randomUUID(),
    operation: input.operation,
    startedAt: performance.now(),
    authCalls: 0,
    mfaCalls: 0,
    databaseUnits: 0,
    sqlStatements: 0,
    rlsSetups: 0,
    workspaceLookups: 0,
    reportingProjections: 0,
    spans: input.attributes
      ? [{ name: "operation.attributes", durationMs: 0, status: "ok", attributes: input.attributes }]
      : [],
  };
}

function logRecord(state: TelemetryState, status: "ok" | "error", error?: unknown) {
  return {
    level: status === "ok" ? "info" : "error",
    message: "Finapp performance operation",
    requestId: state.requestId,
    operationId: state.operationId,
    operation: state.operation,
    status,
    durationMs: durationSince(state.startedAt),
    counts: {
      authCalls: state.authCalls,
      mfaCalls: state.mfaCalls,
      databaseUnits: state.databaseUnits,
      sqlStatements: state.sqlStatements,
      rlsSetups: state.rlsSetups,
      workspaceLookups: state.workspaceLookups,
      reportingProjections: state.reportingProjections,
    },
    spans: state.spans,
    ...(status === "error"
      ? { error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) } }
      : {}),
  };
}

export async function withTelemetryOperation<T>(input: TelemetryOperationInput, callback: () => Promise<T>) {
  if (currentTelemetry()) return callback();

  const state = buildState(input);
  return telemetryStorage.run(state, async () => {
    try {
      const result = await callback();
      if (process.env.FINAPP_PERF_LOG !== "0") console.info(JSON.stringify(logRecord(state, "ok")));
      return result;
    } catch (error) {
      if (process.env.FINAPP_PERF_LOG !== "0") console.error(JSON.stringify(logRecord(state, "error", error)));
      throw error;
    }
  });
}

export function getTelemetrySnapshot() {
  const state = currentTelemetry();
  if (!state) return undefined;
  return {
    requestId: state.requestId,
    operationId: state.operationId,
    operation: state.operation,
    durationMs: durationSince(state.startedAt),
    counts: {
      authCalls: state.authCalls,
      mfaCalls: state.mfaCalls,
      databaseUnits: state.databaseUnits,
      sqlStatements: state.sqlStatements,
      rlsSetups: state.rlsSetups,
      workspaceLookups: state.workspaceLookups,
      reportingProjections: state.reportingProjections,
    },
  };
}
