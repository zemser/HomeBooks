import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd());

const { and, eq } = await import("drizzle-orm");
const { getDb, withDbTransaction } = await import("../src/db");
const { workspaces, workspaceMembers } = await import("../src/db/schema");
const { backfillImportedFxForWorkspace } = await import(
  "../src/features/currency/backfill-imported-fx"
);

const requestedWorkspaceId = process.env.WORKSPACE_ID?.trim() || null;
const db = getDb();
const workspaceRows = requestedWorkspaceId
  ? await db
      .select({
        id: workspaces.id,
        baseCurrency: workspaces.baseCurrency,
      })
      .from(workspaces)
      .where(eq(workspaces.id, requestedWorkspaceId))
  : await db
      .select({
        id: workspaces.id,
        baseCurrency: workspaces.baseCurrency,
      })
      .from(workspaces);

if (workspaceRows.length === 0) {
  console.error("No matching workspace found.");
  process.exit(1);
}

let totalUpdated = 0;

for (const workspace of workspaceRows) {
  const [member] = await db
    .select({
      id: workspaceMembers.id,
      userId: workspaceMembers.userId,
    })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.isActive, true)))
    .limit(1);

  if (!member) {
    console.log(`${workspace.id}: skipped (no active member)`);
    continue;
  }

  const result = await withDbTransaction(member.userId, (tx) =>
    backfillImportedFxForWorkspace(
      {
        userId: member.userId,
        workspaceId: workspace.id,
        memberId: member.id,
        baseCurrency: workspace.baseCurrency,
      },
      tx,
    ),
  );

  totalUpdated += result.updatedCount;
  console.log(`${workspace.id}: updated ${result.updatedCount}`);
}

console.log(`Updated ${totalUpdated} older foreign charges with monthly rates.`);
