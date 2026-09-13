import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  earlierMonthString,
  nextMonthString,
  normalizeMonthString,
} from "../../src/features/recurring/utils";

function repositoryFile(relativePath: string) {
  return new URL(`../../${relativePath}`, import.meta.url);
}

test("earlierMonthString picks the oldest month across start-date edits", () => {
  assert.equal(earlierMonthString("2026-06", "2026-05", "2026-07-01"), "2026-05-01");
  assert.equal(earlierMonthString(null, undefined, "2026-06"), "2026-06-01");
  assert.equal(earlierMonthString(), null);
});

test("nextMonthString advances a stored month key", () => {
  assert.equal(nextMonthString("2026-05-01"), "2026-06-01");
  assert.equal(normalizeMonthString("2026-05"), "2026-05-01");
});

test("recurring identity edits stay on the rule and amount edits stay on versions", async () => {
  const [serviceSource, routeSource, versionRouteSource, clientSource] = await Promise.all([
    readFile(repositoryFile("src/features/recurring/service.ts"), "utf8"),
    readFile(repositoryFile("src/app/api/recurring/[recurringEntryId]/route.ts"), "utf8"),
    readFile(
      repositoryFile("src/app/api/recurring/[recurringEntryId]/versions/[versionId]/route.ts"),
      "utf8",
    ),
    readFile(repositoryFile("src/components/recurring/recurring-page-client.tsx"), "utf8"),
  ]);

  assert.match(routeSource, /effectiveStartMonth: z\.string\(\)\.trim\(\)\.min\(1\)\.optional\(\)/);
  assert.doesNotMatch(routeSource, /amount: z\.coerce\.number\(\)\.positive\(\)\.optional\(\)/);
  assert.match(serviceSource, /effectiveStartMonth: nextStartMonth/);
  assert.match(serviceSource, /export async function updateRecurringEntryVersion/);
  assert.match(serviceSource, /export async function deleteRecurringEntryVersion/);
  assert.match(
    serviceSource,
    /You can only remove an amount change that has not started yet/,
  );
  assert.match(versionRouteSource, /updateRecurringEntryVersion/);
  assert.match(versionRouteSource, /deleteRecurringEntryVersion/);
  assert.match(clientSource, /<span>Starts<\/span>/);
  assert.match(clientSource, /If the amount changes later/);
  assert.match(clientSource, /Fix a wrong amount here/);
  assert.match(clientSource, /canRemoveAmountChange/);
  assert.match(clientSource, /handleUpdateVersion/);
  assert.match(clientSource, /Moving it later takes those months out of reports/);
  assert.match(clientSource, /max=\{latestAllowedStartMonth\}/);
  assert.doesNotMatch(clientSource, /Schedule a future change/);
  assert.doesNotMatch(clientSource, />Effective month</);
  assert.doesNotMatch(clientSource, /Amount now/);
});

test("manual entry save keeps the row in the matching month and explains reports", async () => {
  const clientSource = await readFile(
    repositoryFile("src/components/expenses/expenses-page-client.tsx"),
    "utf8",
  );

  assert.match(clientSource, /setMonthFilter\(entryMonth\)/);
  assert.match(clientSource, /table-row-just-saved/);
  assert.match(clientSource, /setJustSavedManualEntryId\(\(current\) =>/);
  assert.match(clientSource, /dismissStatus\(\)/);
  assert.match(clientSource, /setSavedEntryMonth\(null\)/);
  assert.match(clientSource, /Reports under Income/);
  assert.match(clientSource, /this month’s spending on Reports/);
  assert.match(clientSource, /Add expense or income/);
  assert.match(clientSource, /Cash and one-off entries/);
});
