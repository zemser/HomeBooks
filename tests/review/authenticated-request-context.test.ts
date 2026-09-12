import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contextPath = new URL(
  "../../src/features/workspaces/current-context.ts",
  import.meta.url,
);

test("authenticated request context is React-request memoized and returns verified identity state", async () => {
  const source = await readFile(contextPath, "utf8");

  assert.match(source, /import \{ cache \} from "react"/);
  assert.match(source, /export const resolveAuthenticatedRequestContext = cache\(/);
  assert.match(source, /verifiedSubject: string/);
  assert.match(source, /aal: VerifiedAuthContext\["aal"\]/);
  assert.match(source, /appUser: typeof users\.\$inferSelect/);
  assert.match(source, /membership: typeof workspaceMembers\.\$inferSelect/);
  assert.match(source, /workspace: typeof workspaces\.\$inferSelect/);
  assert.match(source, /return createAuthenticatedRequestContext\(/);
});

test("workspace callbacks receive one complete context instead of re-resolving identity", async () => {
  const source = await readFile(contextPath, "utf8");

  assert.match(
    source,
    /callback: \(context: AuthenticatedRequestContext\) => Promise<T>/,
  );
  assert.match(source, /return resolveAuthenticatedRequestContext\(\);/);
  assert.match(source, /withDbTransaction\(context\.userId, \(\) => callback\(context\)\)/);
  assert.match(source, /return withCurrentWorkspace\(\(context\) => callback\(context, getDb\(\)\)\)/);
});

test("the app layout suspends account chrome instead of awaiting workspace context", async () => {
  const layout = await readFile(
    new URL("../../src/app/(app)/layout.tsx", import.meta.url),
    "utf8",
  );

  assert.match(layout, /<AccountSlot \/>/);
  assert.match(layout, /<Suspense fallback=\{<AccountControlSkeleton \/>\}>/);
  assert.doesNotMatch(layout, /export default async function AppLayout/);
});
