import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL(
  "../../src/features/workspaces/current-context.ts",
  import.meta.url,
);

test("hosted workspace resolution is read-only and redirects missing state to onboarding", async () => {
  const source = await readFile(sourcePath, "utf8");
  const hostedResolverStart = source.indexOf("async function resolveSupabaseRequestContext");
  const hostedSource = source.slice(hostedResolverStart);

  assert.notEqual(hostedResolverStart, -1);
  assert.match(hostedSource, /users\.id/);
  assert.match(hostedSource, /redirect\("\/onboarding"\)/);
  assert.doesNotMatch(hostedSource, /pg_advisory_xact_lock/);
  assert.doesNotMatch(hostedSource, /\.insert\(users\)/);
  assert.doesNotMatch(hostedSource, /\.insert\(workspaces\)/);
  assert.doesNotMatch(hostedSource, /seedStarterWorkspaceCategories/);
});
