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

test("recurring updates can move the opening month and keep future amount changes separate", async () => {
  const [serviceSource, routeSource, clientSource] = await Promise.all([
    readFile(repositoryFile("src/features/recurring/service.ts"), "utf8"),
    readFile(repositoryFile("src/app/api/recurring/[recurringEntryId]/route.ts"), "utf8"),
    readFile(repositoryFile("src/components/recurring/recurring-page-client.tsx"), "utf8"),
  ]);

  assert.match(routeSource, /effectiveStartMonth: z\.string\(\)\.trim\(\)\.min\(1\)\.optional\(\)/);
  assert.match(routeSource, /amount: z\.coerce\.number\(\)\.positive\(\)\.optional\(\)/);
  assert.match(serviceSource, /effectiveStartMonth: nextStartMonth/);
  assert.match(
    serviceSource,
    /The starting month must be before the next scheduled amount change/,
  );
  assert.match(
    serviceSource,
    /To change when this rule began, edit Starts on the rule itself/,
  );
  assert.match(clientSource, /<span>Starts<\/span>/);
  assert.match(clientSource, /If the amount changes later/);
  assert.match(clientSource, /startsMonth: openingVersion/);
  assert.doesNotMatch(clientSource, /Schedule a future change/);
  assert.doesNotMatch(clientSource, />Effective month</);
});

test("manual entry save keeps the row in the matching month and explains reports", async () => {
  const clientSource = await readFile(
    repositoryFile("src/components/expenses/expenses-page-client.tsx"),
    "utf8",
  );

  assert.match(clientSource, /setMonthFilter\(entryMonth\)/);
  assert.match(clientSource, /table-row-just-saved/);
  assert.match(clientSource, /Reports under Income/);
  assert.match(clientSource, /this month’s spending on Reports/);
  assert.match(clientSource, /Add expense or income/);
  assert.match(clientSource, /Cash and one-off entries/);
});
