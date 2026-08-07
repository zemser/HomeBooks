import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dbPath = new URL("../../src/db/index.ts", import.meta.url);
const contextPath = new URL(
  "../../src/features/workspaces/current-context.ts",
  import.meta.url,
);
const onboardingPath = new URL(
  "../../src/features/workspaces/onboarding.ts",
  import.meta.url,
);

test("transaction executor establishes RLS once and instruments its unit", async () => {
  const source = await readFile(dbPath, "utf8");

  assert.match(source, /export type DbExecutor/);
  assert.match(source, /export async function withDbTransaction/);
  assert.match(source, /withTelemetrySpan\("db\.transaction"/);
  assert.match(
    source,
    /await client\.query\("begin"\);[\s\S]*recordRlsSetup\(\);[\s\S]*set_config\('app\.current_user_id', \$1, true\)/,
  );
  assert.match(source, /await client\.query\("commit"\);/);
  assert.match(source, /await client\.query\("rollback"\)\.catch\(\(\) => undefined\)/);
  assert.match(source, /client\.release\(\);/);
});

test("workspace context and onboarding use the explicit transaction boundary", async () => {
  const [contextSource, onboardingSource] = await Promise.all([
    readFile(contextPath, "utf8"),
    readFile(onboardingPath, "utf8"),
  ]);

  assert.match(contextSource, /withDbTransaction\(authContext\.userId/);
  assert.doesNotMatch(contextSource, /establishRlsIdentity/);
  assert.match(onboardingSource, /withDbTransaction\(authUser\.userId/);
  assert.doesNotMatch(onboardingSource, /set_config\('app\.current_user_id'/);
});

