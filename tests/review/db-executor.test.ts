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
const membersPath = new URL(
  "../../src/features/workspaces/members.ts",
  import.meta.url,
);
const settingsPath = new URL(
  "../../src/features/workspaces/settings.ts",
  import.meta.url,
);
const homePath = new URL("../../src/features/home/service.ts", import.meta.url);
const expensesQueriesPath = new URL(
  "../../src/features/expenses/queries.ts",
  import.meta.url,
);
const classificationsPath = new URL(
  "../../src/features/expenses/classifications.ts",
  import.meta.url,
);
const importPersistencePath = new URL(
  "../../src/features/imports/persistence.ts",
  import.meta.url,
);
const importsRoutePath = new URL(
  "../../src/app/api/imports/route.ts",
  import.meta.url,
);

test("transaction executor establishes RLS once and instruments its unit", async () => {
  const source = await readFile(dbPath, "utf8");

  assert.match(source, /export type DbExecutor/);
  assert.match(source, /const activeExecutor = new AsyncLocalStorage<DbExecutor>\(\)/);
  assert.match(source, /const executor = activeExecutor\.getStore\(\);/);
  assert.match(source, /activeExecutor\.run\(executor, \(\) => callback\(executor\)\)/);
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

test("workspace settings and member services accept an explicit executor", async () => {
  const [membersSource, settingsSource, contextSource] = await Promise.all([
    readFile(membersPath, "utf8"),
    readFile(settingsPath, "utf8"),
    readFile(contextPath, "utf8"),
  ]);

  assert.match(contextSource, /export async function withCurrentWorkspaceDb/);
  assert.match(membersSource, /db: DbExecutor = getDb\(\)/);
  assert.match(settingsSource, /db: DbExecutor = getDb\(\)/);
  assert.doesNotMatch(membersSource, /db\.transaction\(/);
  assert.doesNotMatch(settingsSource, /db\.transaction\(/);
});

test("home and app-shell reads use the explicit transaction executor", async () => {
  const [homeSource, layoutSource, pageSource, importsSource] = await Promise.all([
    readFile(homePath, "utf8"),
    readFile(new URL("../../src/app/(app)/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/(app)/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/features/imports/persistence.ts", import.meta.url), "utf8"),
  ]);

  assert.match(homeSource, /db: DbExecutor = getDb\(\)/);
  assert.match(homeSource, /listWorkspaceMembersForSettings\(context, db\)/);
  assert.match(homeSource, /getWorkspaceSettingsSnapshot\(context, db\)/);
  assert.match(homeSource, /listSavedImports\(context, \{ type: "bank" \}, db\)/);
  assert.match(layoutSource, /withCurrentWorkspaceDb\(\(context, db\)/);
  assert.match(pageSource, /withCurrentWorkspaceDb\(\(context, db\)/);
  assert.match(importsSource, /db: DbExecutor = getDb\(\)/);
  assert.match(
    await readFile(new URL("../../src/app/(app)/imports/page.tsx", import.meta.url), "utf8"),
    /withCurrentWorkspaceDb\(\s*async \(context, db\)/,
  );
  assert.match(
    await readFile(new URL("../../src/app/api/imports/route.ts", import.meta.url), "utf8"),
    /withCurrentWorkspaceDb\(\s*async \(context, db\)/,
  );
  assert.match(importsSource, /db\?: DbExecutor/);
  assert.match(
    await readFile(new URL("../../src/app/api/imports/preview/route.ts", import.meta.url), "utf8"),
    /withCurrentWorkspaceDb\(\(context, db\)/,
  );
});

test("expense reads and classification commands use the explicit transaction executor", async () => {
  const [queriesSource, classificationsSource, expensesPageSource, expensesApiSource, reviewPageSource] =
    await Promise.all([
      readFile(expensesQueriesPath, "utf8"),
      readFile(classificationsPath, "utf8"),
      readFile(new URL("../../src/app/(app)/expenses/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../src/app/api/expenses/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/app/(app)/imports/review/page.tsx", import.meta.url), "utf8"),
    ]);

  assert.match(queriesSource, /listExpenseTransactions\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(queriesSource, /listWorkspaceMembers\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(queriesSource, /listReviewQueue\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(classificationsSource, /upsertTransactionClassification\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(classificationsSource, /bulkClassifyTransactions\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(classificationsSource, /undoClassificationDecision\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(expensesPageSource, /withCurrentWorkspaceDb\(\(context, db\)/);
  assert.match(expensesApiSource, /withCurrentWorkspaceDb\(async \(context, db\)/);
  assert.match(reviewPageSource, /withCurrentWorkspaceDb\(\(context, db\)/);
});

test("import persistence keeps parsing and Storage work outside DB transactions", async () => {
  const [persistenceSource, routeSource] = await Promise.all([
    readFile(importPersistencePath, "utf8"),
    readFile(importsRoutePath, "utf8"),
  ]);

  assert.match(persistenceSource, /withDbTransaction\(input\.context\.userId/);
  assert.match(persistenceSource, /await writeImportFile\(/);
  assert.match(persistenceSource, /await deleteImportFileAfterSuccessfulPersistence\(/);
  assert.match(persistenceSource, /withDbTransaction\(input\.context\.userId, async \(tx\)/);
  assert.match(persistenceSource, /syncTransactionExpenseEvents\([\s\S]*\btx,\s*\n?\s*\)/);
  assert.match(routeSource, /resolveCurrentWorkspaceContext\(\)/);
  assert.match(routeSource, /persistBankImport\(/);
  assert.doesNotMatch(routeSource, /withCurrentWorkspace\(/);
});
