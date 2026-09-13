import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  inferBackfillSplitForSettlement,
  mapClassificationType,
  normalizeLegacyRuleScope,
  normalizeLegacyScope,
} from "../../src/features/expenses/spending-scope";

test("legacy household maps to shared", () => {
  assert.equal(mapClassificationType("household"), "shared");
  assert.equal(mapClassificationType("shared"), "shared");
  assert.equal(mapClassificationType("personal"), "personal");
});

test("backfill maps household to shared with split off", () => {
  assert.equal(
    inferBackfillSplitForSettlement({
      originalClassificationType: "household",
      activeMemberCount: 2,
    }),
    false,
  );
  assert.deepEqual(normalizeLegacyScope({ classificationType: "household" }), {
    classificationType: "shared",
    splitForSettlement: false,
  });
});

test("backfill maps two-member shared to split on", () => {
  assert.equal(
    inferBackfillSplitForSettlement({
      originalClassificationType: "shared",
      activeMemberCount: 2,
    }),
    true,
  );
});

test("backfill maps one-member shared to split off", () => {
  assert.equal(
    inferBackfillSplitForSettlement({
      originalClassificationType: "shared",
      activeMemberCount: 1,
    }),
    false,
  );
});

test("household merchant rules backfill to shared with split off", () => {
  assert.deepEqual(
    normalizeLegacyRuleScope({ defaultClassificationType: "household" }),
    {
      defaultClassificationType: "shared",
      defaultSplitForSettlement: false,
    },
  );
});

test("two-member shared merchant rules backfill to shared with split on", () => {
  assert.equal(
    inferBackfillSplitForSettlement({
      originalClassificationType: "shared",
      activeMemberCount: 2,
    }),
    true,
  );
  assert.deepEqual(normalizeLegacyRuleScope({ defaultClassificationType: "shared" }), {
    defaultClassificationType: "shared",
    defaultSplitForSettlement: true,
  });
});

test("undo of a legacy household classification snapshot writes shared with split off", () => {
  assert.deepEqual(normalizeLegacyScope({ classificationType: "household" }), {
    classificationType: "shared",
    splitForSettlement: false,
  });
});

test("undo of a legacy household rule snapshot writes shared with split off", () => {
  assert.deepEqual(
    normalizeLegacyRuleScope({ defaultClassificationType: "household" }),
    {
      defaultClassificationType: "shared",
      defaultSplitForSettlement: false,
    },
  );
});

test("undo of a legacy shared snapshot with no flag writes split on", () => {
  assert.deepEqual(normalizeLegacyScope({ classificationType: "shared" }), {
    classificationType: "shared",
    splitForSettlement: true,
  });
});

test("undo of a snapshot that already stored a flag keeps that flag", () => {
  assert.deepEqual(
    normalizeLegacyScope({ classificationType: "shared", splitForSettlement: false }),
    {
      classificationType: "shared",
      splitForSettlement: false,
    },
  );
  assert.deepEqual(
    normalizeLegacyScope({ classificationType: "shared", splitForSettlement: true }),
    {
      classificationType: "shared",
      splitForSettlement: true,
    },
  );
  assert.deepEqual(
    normalizeLegacyScope({ classificationType: "household", splitForSettlement: true }),
    {
      classificationType: "shared",
      splitForSettlement: true,
    },
  );
  assert.deepEqual(
    normalizeLegacyRuleScope({
      defaultClassificationType: "shared",
      defaultSplitForSettlement: false,
    }),
    {
      defaultClassificationType: "shared",
      defaultSplitForSettlement: false,
    },
  );
});

test("stored flags on non-shared types stay off after mapping", () => {
  assert.deepEqual(
    normalizeLegacyScope({ classificationType: "personal", splitForSettlement: true }),
    {
      classificationType: "personal",
      splitForSettlement: false,
    },
  );
});

test("migration 0016 maps household then recreates the enum without it", async () => {
  const migration = await readFile(
    new URL("../../src/db/migrations/0016_shiny_clint_barton.sql", import.meta.url),
    "utf8",
  );

  const splitColumn = migration.indexOf(
    'ALTER TABLE "transaction_classifications" ADD COLUMN "split_for_settlement"',
  );
  const householdSplitsDeleted = migration.indexOf(
    `AND "expense_events"."classification_type" = 'household'`,
  );
  const twoMemberShared = migration.indexOf(
    `AND "tc"."classification_type" = 'shared'`,
  );
  const householdMapped = migration.indexOf(
    `WHERE "classification_type" = 'household'`,
  );
  const enumRecreated = migration.indexOf(
    `CREATE TYPE "public"."classification_type" AS ENUM('personal', 'shared', 'income', 'transfer', 'ignore')`,
  );

  assert.ok(splitColumn >= 0);
  assert.ok(householdSplitsDeleted > splitColumn);
  assert.ok(twoMemberShared > householdSplitsDeleted);
  assert.ok(householdMapped > twoMemberShared);
  assert.ok(enumRecreated > householdMapped);
  assert.match(migration, /inferBackfillSplitForSettlement/);
  assert.doesNotMatch(
    migration.slice(enumRecreated),
    /'household'/,
  );
});
