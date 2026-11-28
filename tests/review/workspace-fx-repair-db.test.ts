import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import {
  FX_REPAIR_PAGE_SIZE,
  reconcilePendingFxForWorkspace,
} from "@/features/currency/backfill-imported-fx";
import {
  drainWorkspaceRepairPage,
  enqueueWorkspaceRepairs,
  type RepairPage,
} from "@/features/currency/workspace-repair-queue";

test(
  "a failed household backs off while another commits bounded FX pages and picks up late imports",
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    const rollback = Error("rollback fixtures");
    try {
      await assert.rejects(
        db.transaction(async (tx) => {
          const key = {
            baseCurrency: "USD",
            quoteCurrency: "ILS",
            yearMonth: "2076-01-01",
          };
          const [grants] = (
            await tx.execute(sql`select
        to_regprocedure('public.fx_repair_workspaces(text,text,date)') is null as private_only,
        has_function_privilege('homebooks_fx_worker','app.fx_repair_workspaces(text,text,date,uuid)','execute') as worker,
        has_function_privilege('authenticated','app.fx_repair_workspaces(text,text,date,uuid)','execute') as app_user`)
          ).rows;
          assert.deepEqual(grants, {
            private_only: true,
            worker: true,
            app_user: false,
          });
          await tx.insert(schema.exchangeRateMonthly).values({
            ...key,
            averageRate: "3.1",
            sourceName: "boi-monthly-v1:" + randomUUID(),
          });
          const households = await tx
            .insert(schema.workspaces)
            .values(
              ["a", "f"].map((prefix) => ({
                id: prefix + randomUUID().slice(1),
                name: "Reconciliation",
                baseCurrency: "ILS",
                fxPolicy: "previous-month-v1" as const,
              })),
            )
            .returning();
          const [blocked, healthy] = households.map((w) => w.id);
          const prefix = randomUUID().slice(0, 24);
          const sourceId = (n: number) =>
            prefix + n.toString(16).padStart(12, "0");
          for (const ws of households) {
            const [user] = await tx
              .insert(schema.users)
              .values({
                displayName: "Member",
                email: randomUUID() + "@example.test",
              })
              .returning();
            const [member] = await tx
              .insert(schema.workspaceMembers)
              .values({
                workspaceId: ws.id,
                userId: user.id,
                role: "owner",
              })
              .returning();
            const base = {
              workspaceId: ws.id,
              payerMemberId: member.id,
              sourceType: "recurring_generated" as const,
              classificationType: "shared" as const,
              eventKind: "expense" as const,
              eventDate: "2076-02-07",
              title: "FX fixture",
              originalAmount: "10",
              originalCurrency: "USD",
              workspaceCurrency: "ILS",
              valuationPolicy: "previous-month-v1" as const,
              valuationState: "pending" as const,
              normalizedAmount: "0",
              normalizationRate: "0",
              normalizationRateSource: "missing-monthly-rate",
              referenceMonth: key.yearMonth,
            };
            if (ws.id === healthy) {
              await tx
                .insert(schema.manualEntries)
                .values(
                  Array.from({ length: FX_REPAIR_PAGE_SIZE + 2 }, (_, i) => ({
                    ...base,
                    id: sourceId(i + 1),
                  })),
                );
            } else {
              await tx.insert(schema.manualEntries).values(base);
            }
          }
          await tx.insert(schema.manualEntryOverrides).values(
            [1, 2].map((n) => ({
              manualEntryId: sourceId(n),
              overrideType: "amount" as const,
              newValueJson: "10",
            })),
          );
          await tx.execute(sql`set local role homebooks_fx_worker`);
          await enqueueWorkspaceRepairs(tx, key);
          let fail = true;
          const repair: RepairPage = async (context, key, cursor) => {
            if (context.workspaceId === blocked && fail)
              throw Error("household temporarily unavailable");
            return reconcilePendingFxForWorkspace(context, tx, key, cursor);
          };
          const run = () => drainWorkspaceRepairPage(tx, repair);
          assert.deepEqual(await run(), { claimed: 1, completed: 0 });
          const failed = (
            await tx.execute(sql`select attempts,last_error from app.fx_workspace_repairs
        where workspace_id=${blocked}`)
          ).rows;
          assert.deepEqual(failed, [
            { attempts: 1, last_error: "household temporarily unavailable" },
          ]);
          // Production uses a separate application connection for the household write.
          await tx.execute(sql`reset role`);
          assert.deepEqual(await run(), { claimed: 1, completed: 0 });
          const checkpoint = (
            await tx.execute(sql`select cursor_id,cursor_kind from app.fx_workspace_repairs
        where workspace_id=${healthy}`)
          ).rows;
          assert.deepEqual(checkpoint, [
            {
              cursor_id: sourceId(FX_REPAIR_PAGE_SIZE),
              cursor_kind: "recurring",
            },
          ]);
          const [remaining] = (
            await tx.execute(sql`select count(*)::int as count from manual_entries
        where workspace_id=${healthy} and valuation_state='pending'`)
          ).rows;
          assert.equal(remaining.count, 4);
          // A late source has a lower UUID than the checkpoint. Re-enqueueing must include it.
          const [pending] = await tx
            .select()
            .from(schema.manualEntries)
            .where(sql`workspace_id=${healthy} and valuation_state='pending'`)
            .limit(1);
          await tx
            .insert(schema.manualEntries)
            .values({ ...pending, id: sourceId(0) });
          await enqueueWorkspaceRepairs(tx, key);
          const [rediscovered] = (
            await tx.execute(sql`select cursor_id,rescan_requested from app.fx_workspace_repairs
        where workspace_id=${healthy}`)
          ).rows;
          assert.deepEqual(rediscovered, {
            cursor_id: sourceId(FX_REPAIR_PAGE_SIZE),
            rescan_requested: true,
          });
          assert.deepEqual(await run(), { claimed: 1, completed: 0 });
          const [lastOriginal] = (
            await tx.execute(
              sql`select valuation_state from manual_entries where id=${sourceId(FX_REPAIR_PAGE_SIZE + 2)}`,
            )
          ).rows;
          assert.equal(lastOriginal.valuation_state, "converted");
          assert.deepEqual(await run(), { claimed: 1, completed: 1 });
          assert.deepEqual(await run(), { claimed: 0, completed: 0 });
          const [audits] = (
            await tx.execute(
              sql`select count(*)::int as writes from fx_history_audit where workspace_id=${healthy}`,
            )
          ).rows;
          assert.equal(audits.writes, FX_REPAIR_PAGE_SIZE + 1);
          fail = false;
          await tx.execute(
            sql`update app.fx_workspace_repairs set available_at=now() where workspace_id=${blocked}`,
          );
          assert.deepEqual(await run(), { claimed: 1, completed: 1 });
          assert.deepEqual(await run(), { claimed: 0, completed: 0 });
          throw rollback;
        }),
        (error) => error === rollback,
      );
    } finally {
      await pool.end();
    }
  },
);
