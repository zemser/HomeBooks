import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  backfillImportedMemberAttribution,
  backfillManualMemberAttribution,
  backfillRuleMemberAttribution,
  classificationAllowsPayer,
  classificationsForEventKind,
  compatibilityMemberOwnerId,
  getEventKindClassificationValidationMessage,
  getMemberAttributionValidationMessage,
  memberAttributionFromSnapshot,
  normalizeClassificationForEventKind,
  reportScopeMemberId,
  resolveImportedPaidByMemberId,
} from "../../src/features/expenses/payer";

test("unassigned household expenses are valid and can record an optional payer", () => {
  assert.equal(
    getMemberAttributionValidationMessage({
      classificationType: "household",
      paidByMemberId: null,
    }),
    null,
  );
  assert.equal(
    getMemberAttributionValidationMessage({
      classificationType: "household",
      paidByMemberId: "member-1",
    }),
    null,
  );
  assert.equal(classificationAllowsPayer("household"), true);
});

test("personal requires an owner even when a payer is present", () => {
  assert.match(
    getMemberAttributionValidationMessage({
      classificationType: "personal",
      personalOwnerMemberId: null,
      paidByMemberId: "member-1",
    }) ?? "",
    /require a member owner/,
  );
  assert.equal(
    getMemberAttributionValidationMessage({
      classificationType: "personal",
      personalOwnerMemberId: "izzy",
      paidByMemberId: "lee",
    }),
    null,
  );
});

test("shared and household accept optional payer and reject personal owner", () => {
  assert.equal(
    getMemberAttributionValidationMessage({
      classificationType: "shared",
      paidByMemberId: null,
    }),
    null,
  );
  assert.equal(
    getMemberAttributionValidationMessage({
      classificationType: "shared",
      paidByMemberId: "lee",
    }),
    null,
  );
  assert.match(
    getMemberAttributionValidationMessage({
      classificationType: "shared",
      personalOwnerMemberId: "izzy",
    }) ?? "",
    /cannot have a personal owner/,
  );
  assert.match(
    getMemberAttributionValidationMessage({
      classificationType: "household",
      personalOwnerMemberId: "izzy",
    }) ?? "",
    /cannot have a personal owner/,
  );
});

test("income accepts optional recipient and rejects payer and personal owner", () => {
  assert.equal(
    getMemberAttributionValidationMessage({
      classificationType: "income",
      receivedByMemberId: "member-1",
    }),
    null,
  );
  assert.equal(
    getMemberAttributionValidationMessage({
      classificationType: "income",
      receivedByMemberId: null,
    }),
    null,
  );
  assert.match(
    getMemberAttributionValidationMessage({
      classificationType: "income",
      paidByMemberId: "member-1",
    }) ?? "",
    /cannot have a payer/,
  );
  assert.match(
    getMemberAttributionValidationMessage({
      classificationType: "income",
      personalOwnerMemberId: "member-1",
    }) ?? "",
    /cannot have a personal owner/,
  );
  assert.equal(classificationAllowsPayer("income"), false);
});

test("transfer and ignore never accept member fields", () => {
  for (const classificationType of ["transfer", "ignore"] as const) {
    assert.match(
      getMemberAttributionValidationMessage({
        classificationType,
        paidByMemberId: "member-1",
      }) ?? "",
      /cannot have a payer/,
    );
    assert.match(
      getMemberAttributionValidationMessage({
        classificationType,
        personalOwnerMemberId: "member-1",
      }) ?? "",
      /cannot have a personal owner/,
    );
    assert.match(
      getMemberAttributionValidationMessage({
        classificationType,
        receivedByMemberId: "member-1",
      }) ?? "",
      /cannot have an income recipient/,
    );
  }
});

test("imported default payer comes from the account owner and stays null when missing", () => {
  assert.equal(
    resolveImportedPaidByMemberId({
      classificationType: "personal",
      accountOwnerMemberId: "lee",
    }),
    "lee",
  );
  assert.equal(
    resolveImportedPaidByMemberId({
      classificationType: "household",
      accountOwnerMemberId: null,
    }),
    null,
  );
  assert.equal(
    resolveImportedPaidByMemberId({
      classificationType: "personal",
      paidByMemberId: "izzy",
      accountOwnerMemberId: "lee",
    }),
    "izzy",
  );
  assert.equal(
    resolveImportedPaidByMemberId({
      classificationType: "personal",
      paidByMemberId: null,
      accountOwnerMemberId: "lee",
    }),
    null,
  );
  assert.equal(
    resolveImportedPaidByMemberId({
      classificationType: "income",
      accountOwnerMemberId: "lee",
    }),
    null,
  );
});

test("backfill maps overloaded member owner without fabricating a personal payer", () => {
  assert.deepEqual(
    backfillImportedMemberAttribution({
      classificationType: "personal",
      memberOwnerId: "izzy",
      accountOwnerMemberId: "lee",
    }),
    {
      personalOwnerMemberId: "izzy",
      paidByMemberId: "lee",
      receivedByMemberId: null,
    },
  );
  assert.deepEqual(
    backfillImportedMemberAttribution({
      classificationType: "personal",
      memberOwnerId: "izzy",
      accountOwnerMemberId: null,
    }),
    {
      personalOwnerMemberId: "izzy",
      paidByMemberId: null,
      receivedByMemberId: null,
    },
  );
  assert.deepEqual(
    backfillImportedMemberAttribution({
      classificationType: "shared",
      memberOwnerId: "lee",
      accountOwnerMemberId: "izzy",
    }),
    {
      personalOwnerMemberId: null,
      paidByMemberId: "lee",
      receivedByMemberId: null,
    },
  );
  assert.deepEqual(
    backfillImportedMemberAttribution({
      classificationType: "income",
      memberOwnerId: "lee",
      accountOwnerMemberId: "izzy",
    }),
    {
      personalOwnerMemberId: null,
      paidByMemberId: null,
      receivedByMemberId: "lee",
    },
  );
  assert.deepEqual(
    backfillImportedMemberAttribution({
      classificationType: "household",
      memberOwnerId: null,
      accountOwnerMemberId: "izzy",
    }),
    {
      personalOwnerMemberId: null,
      paidByMemberId: "izzy",
      receivedByMemberId: null,
    },
  );
});

test("manual backfill keeps personal owner and payer equal and moves income to received-by", () => {
  assert.deepEqual(
    backfillManualMemberAttribution({
      classificationType: "personal",
      payerMemberId: "izzy",
    }),
    {
      personalOwnerMemberId: "izzy",
      paidByMemberId: "izzy",
      receivedByMemberId: null,
    },
  );
  assert.deepEqual(
    backfillManualMemberAttribution({
      classificationType: "income",
      payerMemberId: "lee",
    }),
    {
      personalOwnerMemberId: null,
      paidByMemberId: null,
      receivedByMemberId: "lee",
    },
  );
});

test("rule backfill stores both owner and payer for personal expenses", () => {
  assert.deepEqual(
    backfillRuleMemberAttribution({
      classificationType: "personal",
      defaultMemberOwnerId: "izzy",
    }),
    {
      personalOwnerMemberId: "izzy",
      paidByMemberId: "izzy",
      receivedByMemberId: null,
    },
  );
});

test("expense-event rebuild follows owner for personal scope and paid-by for settlement", () => {
  const imported = backfillImportedMemberAttribution({
    classificationType: "personal",
    memberOwnerId: "izzy",
    accountOwnerMemberId: "lee",
  });

  assert.equal(reportScopeMemberId("personal", imported), "izzy");
  assert.equal(imported.paidByMemberId, "lee");
  assert.equal(compatibilityMemberOwnerId("personal", imported), "izzy");
  assert.equal(compatibilityMemberOwnerId("shared", { ...imported, paidByMemberId: "lee" }), "lee");
});

test("undo snapshots restore the new fields and dual-write the compatibility column", () => {
  const restored = memberAttributionFromSnapshot({
    classificationType: "personal",
    personalOwnerMemberId: "izzy",
    paidByMemberId: "lee",
    receivedByMemberId: null,
  });

  assert.deepEqual(restored, {
    personalOwnerMemberId: "izzy",
    paidByMemberId: "lee",
    receivedByMemberId: null,
  });
  assert.equal(compatibilityMemberOwnerId("personal", restored), "izzy");

  const legacy = memberAttributionFromSnapshot({
    classificationType: "shared",
    memberOwnerId: "lee",
  });
  assert.deepEqual(legacy, {
    personalOwnerMemberId: null,
    paidByMemberId: "lee",
    receivedByMemberId: null,
  });
});

test("event kinds expose only compatible classifications", () => {
  const allClassifications = [
    "personal",
    "shared",
    "household",
    "income",
    "transfer",
    "ignore",
  ] as const;

  assert.deepEqual(classificationsForEventKind("income", allClassifications), ["income"]);
  assert.deepEqual(classificationsForEventKind("expense", allClassifications), [
    "personal",
    "shared",
    "household",
    "transfer",
    "ignore",
  ]);
  assert.match(
    getEventKindClassificationValidationMessage({
      eventKind: "income",
      classificationType: "household",
    }) ?? "",
    /must use income/,
  );
});

test("legacy event-kind mismatches normalize to a compatible classification", () => {
  assert.equal(normalizeClassificationForEventKind("income", "shared"), "income");
  assert.equal(normalizeClassificationForEventKind("expense", "income"), "household");
  assert.equal(normalizeClassificationForEventKind("expense", "shared"), "shared");
});

test("migration 0012 backfills new columns before adding attribution checks", async () => {
  const migration = await readFile(
    new URL("../../src/db/migrations/0012_square_the_order.sql", import.meta.url),
    "utf8",
  );

  const personalOwnerAdd = migration.indexOf(
    'ALTER TABLE "transaction_classifications" ADD COLUMN "personal_owner_member_id"',
  );
  const importedBackfill = migration.indexOf(
    'WHEN "tc"."classification_type" = \'personal\' THEN "tc"."member_owner_id"',
  );
  const personalPayerFromAccount = migration.indexOf(
    'WHEN "tc"."classification_type" IN (\'personal\', \'household\') THEN "fa"."owner_member_id"',
  );
  const sharedPaidBy = migration.indexOf(
    'WHEN "tc"."classification_type" = \'shared\' THEN "tc"."member_owner_id"',
  );
  const incomeReceivedBy = migration.indexOf(
    'WHEN "tc"."classification_type" = \'income\' THEN "tc"."member_owner_id"',
  );
  const incomeManualClearPayer = migration.indexOf(
    'WHEN "classification_type" IN (\'personal\', \'shared\', \'household\') THEN "payer_member_id"',
  );
  const expenseEventRebuild = migration.indexOf(
    '"payer_member_id" = "transaction_classifications"."paid_by_member_id"',
  );
  const keepSharedSplits = migration.indexOf(
    '"expense_events"."classification_type" <> \'shared\'',
  );
  const firstCheck = migration.indexOf("ADD CONSTRAINT \"transaction_classifications_member_attribution_check\"");

  assert.ok(personalOwnerAdd >= 0);
  assert.ok(importedBackfill > personalOwnerAdd);
  assert.ok(personalPayerFromAccount > importedBackfill);
  assert.ok(sharedPaidBy > 0);
  assert.ok(incomeReceivedBy > 0);
  assert.ok(incomeManualClearPayer > 0);
  assert.ok(expenseEventRebuild > importedBackfill);
  assert.ok(keepSharedSplits > expenseEventRebuild);
  assert.ok(firstCheck > expenseEventRebuild);
  assert.doesNotMatch(migration, /INSERT INTO "shared_expense_splits"/);
});

