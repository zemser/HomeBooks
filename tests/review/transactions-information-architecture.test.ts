import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

async function source(relativePath: string) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("Phase 4 exposes only the canonical transaction route modules", async () => {
  for (const route of ["transactions/page.tsx", "transactions/review/page.tsx", "transactions/all/page.tsx"]) {
    assert.equal(existsSync(path.join(projectRoot, "src/app/(app)", route)), true);
  }

  for (const legacyRoute of ["imports", "imports/review", "expenses"]) {
    assert.equal(existsSync(path.join(projectRoot, "src/app/(app)", legacyRoute, "page.tsx")), false);
  }
});

test("transaction workflow links and import completion use canonical destinations", async () => {
  const [workflow, importPreview, reviewQueue, allTransactions] = await Promise.all([
    source("src/components/transactions/transactions-workflow-nav.tsx"),
    source("src/components/imports/import-preview-client.tsx"),
    source("src/components/expenses/review-queue-client.tsx"),
    source("src/app/(app)/transactions/all/page.tsx"),
  ]);

  assert.match(workflow, /href: "\/transactions"/);
  assert.match(workflow, /href: "\/transactions\/review"/);
  assert.match(workflow, /href: "\/transactions\/all"/);
  assert.match(importPreview, /`\/transactions\/review\?import=/);
  assert.match(importPreview, /href="\/transactions\/all"/);
  assert.match(reviewQueue, /`\/transactions\/all\?transactionId=/);
  assert.match(allTransactions, /href="\/transactions\/review"/);
});

test("navigation model carries parent activity, beta, and attention metadata", async () => {
  const nav = await source("src/components/app-shell/nav.ts");
  const shell = await source("src/components/app-shell/app-shell-client.tsx");

  assert.match(nav, /label: "Transactions"[\s\S]*attention: "review"/);
  assert.match(nav, /label: "Investments"[\s\S]*betaLabel: "Beta"/);
  assert.match(nav, /label: "More"[\s\S]*activePaths:/);
  assert.match(shell, /navigation\.titleItems\.find/);
  assert.match(shell, /navigation\.mobileItems\.map/);
  assert.doesNotMatch(shell, /item\.href ===/);
});

test("the review URL synchronizer preserves pageSize on canonical routes", async () => {
  const reviewQueue = await source("src/components/expenses/review-queue-client.tsx");

  assert.match(reviewQueue, /window\.location\.pathname/);
  assert.doesNotMatch(reviewQueue, /delete\("pageSize"\)/);
});

test("transaction surfaces do not retain obsolete expenses copy or review header styles", async () => {
  const [allTransactions, globalStyles] = await Promise.all([
    source("src/components/expenses/expenses-page-client.tsx"),
    source("src/app/globals.css"),
  ]);

  assert.doesNotMatch(allTransactions, /Could not load expenses|Loading expenses/);
  assert.doesNotMatch(globalStyles, /\.review-page-header\b|\.bulk-controls-legacy\b/);
});
