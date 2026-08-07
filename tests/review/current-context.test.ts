import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL(
  "../../src/features/workspaces/current-context.ts",
  import.meta.url,
);

test("workspace resolution reads established state before taking a bootstrap lock", async () => {
  const source = await readFile(sourcePath, "utf8");
  const fastPathStart = source.indexOf("const fastPath =");
  const firstHostedLock = source.indexOf(
    "pg_advisory_xact_lock(hashtext(${authContext.userId}))",
  );

  assert.notEqual(fastPathStart, -1);
  assert.notEqual(firstHostedLock, -1);
  assert.ok(fastPathStart < firstHostedLock);
  assert.match(
    source.slice(fastPathStart, firstHostedLock),
    /users\.findFirst|users\.id/,
  );
  assert.doesNotMatch(
    source.slice(fastPathStart, firstHostedLock),
    /pg_advisory_xact_lock/,
  );
});

test("missing hosted users are arbitrated by a locked recheck and idempotent insert", async () => {
  const source = await readFile(sourcePath, "utf8");
  const bootstrapStart = source.indexOf(
    "pg_advisory_xact_lock(hashtext(${authContext.userId}))",
  );
  const bootstrapSource = source.slice(bootstrapStart);

  assert.match(bootstrapSource, /users\.findFirst/);
  assert.match(bootstrapSource, /onConflictDoNothing\(\{ target: users\.id \}\)/);
  assert.match(bootstrapSource, /insertedUser \?\? await tx\.query\.users\.findFirst/);
});
