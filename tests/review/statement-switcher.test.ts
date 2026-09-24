import assert from "node:assert/strict";
import test from "node:test";

import {
  filterStatements,
  groupStatementsBySource,
  partitionStatements,
  statementOptionLabel,
  statementPeriodLabel,
  statementSwitcherMode,
  statementSwitcherTriggerLabel,
} from "../../src/components/expenses/statement-switcher-model";
import type { ReviewQueueImportSummary } from "../../src/features/expenses/types";

function statement(overrides: Partial<ReviewQueueImportSummary> & Pick<ReviewQueueImportSummary, "importId">): ReviewQueueImportSummary {
  return {
    originalFilename: `${overrides.importId}.csv`,
    sourceName: "Cal",
    totalCount: 10,
    reviewedCount: 4,
    remainingCount: 6,
    earliestTransactionDate: "2024-03-01",
    latestTransactionDate: "2024-03-31",
    ...overrides,
  };
}

test("a single statement hides the switcher and seven or more open the browser", () => {
  assert.equal(statementSwitcherMode(0), "hidden");
  assert.equal(statementSwitcherMode(1), "hidden");
  assert.equal(statementSwitcherMode(2), "menu");
  assert.equal(statementSwitcherMode(6), "menu");
  assert.equal(statementSwitcherMode(7), "browser");
});

test("the closed control names the current period, or the size of the library", () => {
  const statements = [
    statement({ importId: "mar", latestTransactionDate: "2024-03-31", earliestTransactionDate: "2024-03-01" }),
    statement({ importId: "jan", latestTransactionDate: "2024-01-31", earliestTransactionDate: "2024-01-01" }),
  ];

  assert.match(statementSwitcherTriggerLabel(statements, "mar"), /Mar 2024/);
  assert.equal(statementSwitcherTriggerLabel(statements, "all"), "2 statements");
});

test("active statements group by source with the newest period first", () => {
  const { active, complete } = partitionStatements([
    statement({
      importId: "cal-jan",
      sourceName: "Cal",
      earliestTransactionDate: "2024-01-01",
      latestTransactionDate: "2024-01-31",
    }),
    statement({
      importId: "leumi-mar",
      sourceName: "Leumi",
      earliestTransactionDate: "2024-03-01",
      latestTransactionDate: "2024-03-31",
    }),
    statement({
      importId: "cal-mar",
      sourceName: "Cal",
      earliestTransactionDate: "2024-03-02",
      latestTransactionDate: "2024-03-20",
    }),
    statement({
      importId: "done",
      sourceName: "Cal",
      remainingCount: 0,
      reviewedCount: 10,
    }),
    statement({
      importId: "mystery",
      sourceName: "  ",
      earliestTransactionDate: "2023-12-01",
      latestTransactionDate: "2023-12-31",
    }),
  ]);

  assert.deepEqual(active.map((item) => item.importId), ["leumi-mar", "cal-mar", "cal-jan", "mystery"]);
  assert.deepEqual(complete.map((item) => item.importId), ["done"]);

  const groups = groupStatementsBySource(active);
  assert.deepEqual(groups.map((group) => group.source), ["Cal", "Leumi", "Unknown source"]);
  assert.deepEqual(groups[0]?.statements.map((item) => item.importId), ["cal-mar", "cal-jan"]);
});

test("search matches source, filename, and period", () => {
  const statements = [
    statement({ importId: "cal", originalFilename: "cal_transactions_2024-03.csv", sourceName: "Cal" }),
    statement({
      importId: "leumi",
      originalFilename: "leumi.xls",
      sourceName: "Leumi",
      earliestTransactionDate: "2023-11-01",
      latestTransactionDate: "2023-11-30",
    }),
  ];

  assert.deepEqual(filterStatements(statements, "leumi").map((item) => item.importId), ["leumi"]);
  assert.deepEqual(filterStatements(statements, "cal_transactions").map((item) => item.importId), ["cal"]);
  assert.deepEqual(filterStatements(statements, "nov 2023").map((item) => item.importId), ["leumi"]);
  assert.equal(filterStatements(statements, "missing").length, 0);
});

test("a statement row is labeled by source, period, progress, and filename", () => {
  const item = statement({
    importId: "cal",
    originalFilename: "cal_transactions_2024-03.csv",
    remainingCount: 0,
    reviewedCount: 10,
  });

  assert.match(statementPeriodLabel(item), /Mar 2024/);
  assert.match(statementOptionLabel(item), /Cal, Mar 2024, Complete · 10 handled, cal_transactions_2024-03.csv/);
});
