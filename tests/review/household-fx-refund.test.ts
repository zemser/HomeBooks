import assert from "node:assert/strict";
import test from "node:test";
import { refundValue } from "../../src/features/currency/refunds";
import { allocateAgorot } from "../../src/features/shared-settlements/service";

test("the final partial refund reverses the last agora of the original valuation", () => {
  assert.equal(refundValue("3", "10", "1", "0", "0"), "3.330000");
  assert.equal(refundValue("3", "10", "1", "1", "3.33"), "3.340000");
  assert.equal(refundValue("3", "10", "1", "2", "6.67"), "3.330000");
  assert.throws(() => refundValue("3", "10", "2", "2", "6.67"), /remaining/);
});

test("equal ILS shares allocate the odd agora deterministically, including a refund", () => {
  const weights = ["b", "a"].map((memberId) => ({
    memberId,
    percentageBps: 5000,
  }));
  assert.deepEqual(
    allocateAgorot(31_201_0000n, weights).map((s) => s.amountMicros),
    [156_000_000n, 156_010_000n],
  );
  assert.deepEqual(
    allocateAgorot(-31_201_0000n, weights).map((s) => s.amountMicros),
    [-156_000_000n, -156_010_000n],
  );
});

import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { linkRefund } from "../../src/features/currency/refunds";
import { upsertTransactionClassification } from "../../src/features/expenses/classifications";
import { getMonthlyReport } from "../../src/features/reporting/monthly-report";

test(
  "linking a classified foreign credit reverses purchase value in both report modes",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const db = drizzle(pool, { schema });
    const rollback = new Error("discard fixtures");
    try {
      await assert.rejects(
        db.transaction(async (tx) => {
          const [ws] = await tx
            .insert(schema.workspaces)
            .values({
              name: "Refund fixture",
              baseCurrency: "ILS",
              fxPolicy: "previous-month-v1",
            })
            .returning();
          const [user] = await tx
            .insert(schema.users)
            .values({
              email: randomUUID() + "@example.test",
              displayName: "Refund fixture",
            })
            .returning();
          const [member] = await tx
            .insert(schema.workspaceMembers)
            .values({ workspaceId: ws.id, userId: user.id, role: "owner" })
            .returning();
          const context = {
            workspaceId: ws.id,
            userId: user.id,
            memberId: member.id,
            baseCurrency: "ILS",
            fxPolicy: "previous-month-v1" as const,
          };
          const [acct] = await tx
            .insert(schema.financialAccounts)
            .values({
              workspaceId: ws.id,
              displayName: "Card",
              accountType: "credit_card",
            })
            .returning();
          const [file] = await tx
            .insert(schema.imports)
            .values({
              workspaceId: ws.id,
              uploadedByUserId: user.id,
              type: "bank",
              fileKind: "xlsx",
              originalFilename: "refund.xlsx",
              storagePath: "test",
              fileChecksum: randomUUID(),
              importStatus: "completed",
            })
            .returning();
          const common = {
            workspaceId: ws.id,
            accountId: acct.id,
            importId: file.id,
            description: "Merchant",
            originalCurrency: "USD",
            originalAmount: "100",
            settlementCurrency: "USD",
            settlementAmount: "100",
            workspaceCurrency: "ILS",
            valuationPolicy: "previous-month-v1" as const,
            valuationState: "converted" as const,
            normalizationRateSource: "exchange-rate-monthly:example",
          };
          const [purchase, credit] = await tx
            .insert(schema.transactions)
            .values([
              {
                ...common,
                transactionDate: "2026-11-03",
                direction: "debit",
                dedupeHash: randomUUID(),
                normalizedAmount: "308.8",
                normalizationRate: "3.088",
                referenceMonth: "2026-10-01",
              },
              {
                ...common,
                transactionDate: "2026-12-01",
                direction: "credit",
                dedupeHash: randomUUID(),
                normalizedAmount: "312",
                normalizationRate: "3.12",
                referenceMonth: "2026-11-01",
              },
            ])
            .returning();
          await upsertTransactionClassification(
            context,
            {
              transactionId: credit.id,
              classificationType: "personal",
              personalOwnerMemberId: member.id,
              paidByMemberId: member.id,
            },
            tx,
          );
          assert.equal(
            (await linkRefund(tx, context, credit.id, purchase.id))
              .normalizedAmount,
            "308.800000",
          );
          const [saved] = await tx
            .select()
            .from(schema.transactions)
            .where(eq(schema.transactions.id, credit.id));
          assert.equal(saved.referenceMonth, "2026-10-01");
          for (const mode of ["payment_date", "allocated_period"] as const) {
            const report = await getMonthlyReport(
              context,
              { month: "2026-12", mode },
              tx,
            );
            assert.equal(report.summary.expenseTotal, -308.8);
            assert.equal(report.lineItems[0].sourceNormalizedAmount, -308.8);
          }
          assert.deepEqual(
            await linkRefund(tx, context, credit.id, purchase.id),
            { normalizedAmount: "308.800000" },
          );
          throw rollback;
        }),
        (err) => err === rollback,
      );
    } finally {
      await pool.end();
    }
  },
);
