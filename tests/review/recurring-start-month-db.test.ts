import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";

import * as schema from "../../src/db/schema";
import {
  createRecurringEntry,
  createRecurringEntryVersion,
  deleteRecurringEntryVersion,
  updateRecurringEntry,
  updateRecurringEntryVersion,
} from "../../src/features/recurring/service";
import { nextMonthString } from "../../src/features/recurring/utils";

test("moving a recurring start month earlier rematerializes the new month", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = drizzle(pool, { schema });
  const rollback = new Error("rollback test fixtures");

  try {
    await assert.rejects(db.transaction(async (tx) => {
      const [workspace] = await tx.insert(schema.workspaces).values({
        name: "Recurring start month test",
        baseCurrency: "ILS",
      }).returning();
      const [user] = await tx.insert(schema.users).values({
        displayName: "Alex",
        email: `${randomUUID()}@example.test`,
      }).returning();
      const [member] = await tx.insert(schema.workspaceMembers).values({
        workspaceId: workspace.id,
        userId: user.id,
        role: "member",
      }).returning();
      const context = {
        workspaceId: workspace.id,
        userId: user.id,
        memberId: member.id,
        baseCurrency: "ILS" as const,
      };

      const entry = await createRecurringEntry(context, {
        title: "Rent",
        eventKind: "expense",
        classificationType: "shared",
        effectiveStartMonth: "2026-06",
        amount: 5000,
        currency: "ILS",
        normalizationMode: "none",
        recurrenceRule: "monthly",
      }, tx);

      await updateRecurringEntry(context, entry.id, {
        title: "Rent",
        eventKind: "expense",
        classificationType: "shared",
        active: true,
        effectiveStartMonth: "2026-05",
      }, tx);

      const versions = await tx
        .select({
          effectiveStartMonth: schema.recurringEntryVersions.effectiveStartMonth,
        })
        .from(schema.recurringEntryVersions)
        .where(eq(schema.recurringEntryVersions.recurringEntryId, entry.id));
      const generated = await tx
        .select({
          eventDate: schema.manualEntries.eventDate,
        })
        .from(schema.manualEntries)
        .where(
          and(
            eq(schema.manualEntries.workspaceId, workspace.id),
            eq(schema.manualEntries.sourceType, "recurring_generated"),
            eq(schema.manualEntries.sourceId, entry.id),
          ),
        );
      const months = generated.map((row) => row.eventDate).sort();

      assert.equal(versions[0]?.effectiveStartMonth, "2026-05-01");
      assert.equal(months[0], "2026-05-01");
      assert.ok(months.includes("2026-06-01"));

      throw rollback;
    }), (error: unknown) => error === rollback);
  } finally {
    await pool.end();
  }
});

test("correcting a version amount rematerializes months in that period", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = drizzle(pool, { schema });
  const rollback = new Error("rollback test fixtures");

  try {
    await assert.rejects(db.transaction(async (tx) => {
      const [workspace] = await tx.insert(schema.workspaces).values({
        name: "Recurring amount correction test",
        baseCurrency: "ILS",
      }).returning();
      const [user] = await tx.insert(schema.users).values({
        displayName: "Alex",
        email: `${randomUUID()}@example.test`,
      }).returning();
      const [member] = await tx.insert(schema.workspaceMembers).values({
        workspaceId: workspace.id,
        userId: user.id,
        role: "member",
      }).returning();
      const context = {
        workspaceId: workspace.id,
        userId: user.id,
        memberId: member.id,
        baseCurrency: "ILS" as const,
      };

      const entry = await createRecurringEntry(context, {
        title: "Rent",
        eventKind: "expense",
        classificationType: "shared",
        effectiveStartMonth: "2026-05",
        amount: 5000,
        currency: "ILS",
        normalizationMode: "none",
        recurrenceRule: "monthly",
      }, tx);

      const [version] = await tx
        .select({ id: schema.recurringEntryVersions.id })
        .from(schema.recurringEntryVersions)
        .where(eq(schema.recurringEntryVersions.recurringEntryId, entry.id));

      await updateRecurringEntryVersion(context, {
        recurringEntryId: entry.id,
        versionId: version.id,
        amount: 4500,
        currency: "ILS",
        normalizationMode: "none",
      }, tx);

      const generated = await tx
        .select({
          originalAmount: schema.manualEntries.originalAmount,
        })
        .from(schema.manualEntries)
        .where(
          and(
            eq(schema.manualEntries.workspaceId, workspace.id),
            eq(schema.manualEntries.sourceType, "recurring_generated"),
            eq(schema.manualEntries.sourceId, entry.id),
          ),
        );

      assert.ok(generated.length > 0);
      assert.ok(generated.every((row) => Number(row.originalAmount) === 4500));

      throw rollback;
    }), (error: unknown) => error === rollback);
  } finally {
    await pool.end();
  }
});

test("removing a future amount change restores the previous amount period", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = drizzle(pool, { schema });
  const rollback = new Error("rollback test fixtures");
  const futureMonth = nextMonthString();

  try {
    await assert.rejects(db.transaction(async (tx) => {
      const [workspace] = await tx.insert(schema.workspaces).values({
        name: "Recurring future version delete test",
        baseCurrency: "ILS",
      }).returning();
      const [user] = await tx.insert(schema.users).values({
        displayName: "Alex",
        email: `${randomUUID()}@example.test`,
      }).returning();
      const [member] = await tx.insert(schema.workspaceMembers).values({
        workspaceId: workspace.id,
        userId: user.id,
        role: "member",
      }).returning();
      const context = {
        workspaceId: workspace.id,
        userId: user.id,
        memberId: member.id,
        baseCurrency: "ILS" as const,
      };

      const entry = await createRecurringEntry(context, {
        title: "Rent",
        eventKind: "expense",
        classificationType: "shared",
        effectiveStartMonth: "2026-05",
        amount: 5000,
        currency: "ILS",
        normalizationMode: "none",
        recurrenceRule: "monthly",
      }, tx);

      await createRecurringEntryVersion(context, {
        recurringEntryId: entry.id,
        effectiveStartMonth: futureMonth,
        amount: 5500,
        currency: "ILS",
        normalizationMode: "none",
        recurrenceRule: "monthly",
      }, tx);

      const versionsBefore = await tx
        .select({
          id: schema.recurringEntryVersions.id,
          effectiveStartMonth: schema.recurringEntryVersions.effectiveStartMonth,
        })
        .from(schema.recurringEntryVersions)
        .where(eq(schema.recurringEntryVersions.recurringEntryId, entry.id));
      const futureVersion = versionsBefore.find(
        (version) => version.effectiveStartMonth === futureMonth,
      );

      assert.equal(versionsBefore.length, 2);
      assert.ok(futureVersion);

      await deleteRecurringEntryVersion(context, entry.id, futureVersion.id, tx);

      const versionsAfter = await tx
        .select({
          effectiveStartMonth: schema.recurringEntryVersions.effectiveStartMonth,
          effectiveEndMonth: schema.recurringEntryVersions.effectiveEndMonth,
          amount: schema.recurringEntryVersions.amount,
        })
        .from(schema.recurringEntryVersions)
        .where(eq(schema.recurringEntryVersions.recurringEntryId, entry.id));

      assert.equal(versionsAfter.length, 1);
      assert.equal(versionsAfter[0]?.effectiveEndMonth, null);
      assert.equal(Number(versionsAfter[0]?.amount), 5000);

      throw rollback;
    }), (error: unknown) => error === rollback);
  } finally {
    await pool.end();
  }
});
