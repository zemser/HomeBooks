import assert from "node:assert/strict";
import test from "node:test";

import {
  recordAuthCall,
  recordDatabaseUnit,
  recordReportingProjection,
  recordRlsSetup,
  recordSqlStatement,
  recordWorkspaceLookup,
  withTelemetryOperation,
  withTelemetrySpan,
} from "@/lib/telemetry/server";

test("successful telemetry records duration, counters, and spans without identifiers", async () => {
  const messages: string[] = [];
  const originalInfo = console.info;
  console.info = (message: string) => messages.push(message);

  try {
    await withTelemetryOperation({ operation: "test.request", requestId: "request-test" }, async () => {
      recordAuthCall();
      recordDatabaseUnit();
      recordSqlStatement();
      recordRlsSetup();
      recordWorkspaceLookup();
      recordReportingProjection();
      await withTelemetrySpan("test.stage", async () => undefined);
    });
  } finally {
    console.info = originalInfo;
  }

  const log = JSON.parse(messages[0] ?? "{}");
  assert.equal(log.status, "ok");
  assert.equal(log.requestId, "request-test");
  assert.equal(log.counts.authCalls, 1);
  assert.equal(log.counts.databaseUnits, 1);
  assert.equal(log.counts.sqlStatements, 1);
  assert.equal(log.counts.rlsSetups, 1);
  assert.equal(log.counts.workspaceLookups, 1);
  assert.equal(log.counts.reportingProjections, 1);
  assert.equal(typeof log.durationMs, "number");
  assert.equal(log.spans.some((span: { name: string }) => span.name === "test.stage"), true);
  assert.equal(JSON.stringify(log).includes("user@example.com"), false);
});

test("nested operations share the outer correlation and emit one completion record", async () => {
  const messages: string[] = [];
  const originalInfo = console.info;
  console.info = (message: string) => messages.push(message);

  try {
    await withTelemetryOperation({ operation: "outer", requestId: "request-nested" }, async () => {
      await withTelemetryOperation({ operation: "inner", requestId: "inner-request" }, async () => {
        recordSqlStatement();
      });
    });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(messages.length, 1);
  const log = JSON.parse(messages[0] ?? "{}");
  assert.equal(log.operation, "outer");
  assert.equal(log.requestId, "request-nested");
  assert.equal(log.counts.sqlStatements, 1);
});
