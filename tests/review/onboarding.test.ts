import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionPath = new URL(
  "../../src/features/workspaces/onboarding.ts",
  import.meta.url,
);

test("onboarding owns the serialized bootstrap mutation", async () => {
  const source = await readFile(actionPath, "utf8");

  assert.match(source, /pg_advisory_xact_lock\(hashtext\(\$\{authUser\.userId\}\)\)/);
  assert.match(source, /onConflictDoNothing\(\{\s*target: users\.id/);
  assert.match(source, /seedStarterWorkspaceCategories\(workspaceId, tx\)/);
  assert.match(source, /eq\(members\.isActive, true\)/);
});

test("onboarding has no one-user-one-workspace uniqueness assumption", async () => {
  const source = await readFile(actionPath, "utf8");

  assert.doesNotMatch(source, /unique.*userId/i);
  assert.match(source, /\.insert\(workspaceMembers\)/);
});
