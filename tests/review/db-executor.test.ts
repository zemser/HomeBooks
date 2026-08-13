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
const recurringServicePath = new URL(
  "../../src/features/recurring/service.ts",
  import.meta.url,
);
const reportingPath = new URL(
  "../../src/features/reporting/monthly-report.ts",
  import.meta.url,
);
const settlementsPath = new URL(
  "../../src/features/shared-settlements/service.ts",
  import.meta.url,
);
const manualEntriesPath = new URL(
  "../../src/features/manual-entries/service.ts",
  import.meta.url,
);
const investmentsPath = new URL(
  "../../src/features/investments/persistence.ts",
  import.meta.url,
);
const allocationPath = new URL(
  "../../src/features/expenses/allocation.ts",
  import.meta.url,
);
const categoriesPath = new URL(
  "../../src/features/workspaces/categories.ts",
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
  assert.doesNotMatch(source, /getCurrentDatabaseUserId/);
  assert.doesNotMatch(source, /transactionScopedClient/);
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

test("recurring services and API callers use the explicit transaction executor", async () => {
  const [serviceSource, routeSource, generateRouteSource, detailRouteSource, versionRouteSource] =
    await Promise.all([
      readFile(recurringServicePath, "utf8"),
      readFile(new URL("../../src/app/api/recurring/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/app/api/recurring/generate/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/app/api/recurring/[recurringEntryId]/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/app/api/recurring/[recurringEntryId]/versions/route.ts", import.meta.url), "utf8"),
    ]);

  assert.match(serviceSource, /listRecurringEntries\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(serviceSource, /listGeneratedManualEntries\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(serviceSource, /materializeRecurringEntriesForRange\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(serviceSource, /createRecurringEntry\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(serviceSource, /updateRecurringEntry\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(serviceSource, /deleteRecurringEntry\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(routeSource, /withCurrentWorkspaceDb\(\(context, db\)/);
  assert.match(generateRouteSource, /withCurrentWorkspaceDb\(\(context, db\)/);
  assert.match(detailRouteSource, /withCurrentWorkspaceDb\(\(context, db\)/);
  assert.match(versionRouteSource, /withCurrentWorkspaceDb\(\(context, db\)/);
});

test("reporting reads and callers use the explicit transaction executor", async () => {
  const [reportingSource, reportsPageSource, homeSource] = await Promise.all([
    readFile(reportingPath, "utf8"),
    readFile(new URL("../../src/app/(app)/reports/page.tsx", import.meta.url), "utf8"),
    readFile(homePath, "utf8"),
  ]);

  assert.match(reportingSource, /getMonthlyReport\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(reportingSource, /getYearToDateReport\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(reportingSource, /getRollingTwelveReport\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(reportingSource, /getDashboardSnapshot\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(reportingSource, /materializeRecurringEntriesForRange\([\s\S]*, db\)/);
  assert.match(reportsPageSource, /withCurrentWorkspaceDb\(\s*async \(context, db\)/);
  assert.match(reportsPageSource, /syncExpenseEventsForRange\([\s\S]*, db\)/);
  assert.match(homeSource, /getDashboardSnapshot\([\s\S]*\}, db\)/);
});

test("shared settlement reads and commands use the explicit transaction executor", async () => {
  const [serviceSource, routeSource] = await Promise.all([
    readFile(settlementsPath, "utf8"),
    readFile(new URL("../../src/app/api/shared-settlements/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(serviceSource, /getSharedSettlementsPageData\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(serviceSource, /upsertSharedSettlement\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(serviceSource, /listEligibleSettlementRows\([\s\S]*db: DbExecutor/);
  assert.match(serviceSource, /listSourceDates\([\s\S]*db: DbExecutor/);
  assert.match(routeSource, /withCurrentWorkspaceDb\(\(context, db\)/);
  assert.doesNotMatch(routeSource, /withCurrentWorkspace\(/);
});

test("manual-entry reads and commands use the explicit transaction executor", async () => {
  const [serviceSource, routeSource, detailRouteSource] = await Promise.all([
    readFile(manualEntriesPath, "utf8"),
    readFile(new URL("../../src/app/api/manual-entries/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/api/manual-entries/[manualEntryId]/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(serviceSource, /listOneTimeManualEntries\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(serviceSource, /createOneTimeManualEntry\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(serviceSource, /updateOneTimeManualEntry\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(serviceSource, /deleteOneTimeManualEntry\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(routeSource, /withCurrentWorkspaceDb\(\(context, db\)/);
  assert.match(detailRouteSource, /withCurrentWorkspaceDb\(\(context, db\)/);
});

test("investment reads and persistence preserve the DB/Storage boundary", async () => {
  const [persistenceSource, routeSource, pageSource] = await Promise.all([
    readFile(investmentsPath, "utf8"),
    readFile(new URL("../../src/app/api/investments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/(app)/investments/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(persistenceSource, /listInvestmentImports\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(persistenceSource, /listInvestmentActivities\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(persistenceSource, /listInvestmentAccountHoldings\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(persistenceSource, /withDbTransaction\(input\.context\.userId/);
  assert.match(persistenceSource, /await writeImportFile\([\s\S]*\n\s*\}\);[\s\S]*withDbTransaction/);
  assert.match(routeSource, /resolveCurrentWorkspaceContext\(\)/);
  assert.match(routeSource, /withCurrentWorkspaceDb\(async \(currentContext, db\)/);
  assert.match(pageSource, /withCurrentWorkspaceDb\(async \(context, db\)/);
});

test("allocation and category commands use the explicit transaction executor", async () => {
  const [allocationSource, categoriesSource, allocationRouteSource, categoriesRouteSource] =
    await Promise.all([
      readFile(allocationPath, "utf8"),
      readFile(categoriesPath, "utf8"),
      readFile(new URL("../../src/app/api/transaction-allocations/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/app/api/workspace-categories/route.ts", import.meta.url), "utf8"),
    ]);

  assert.match(allocationSource, /updateExpenseAllocation\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(categoriesSource, /createWorkspaceCategory\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(categoriesSource, /updateWorkspaceCategory\([\s\S]*db: DbExecutor = getDb\(\)/);
  assert.match(allocationRouteSource, /withCurrentWorkspaceDb\(\(context, db\)/);
  assert.match(categoriesRouteSource, /withCurrentWorkspaceDb\(\(context, db\)/);
});
