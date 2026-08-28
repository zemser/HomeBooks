import { sql } from "drizzle-orm";

import type { DbExecutor } from "@/db";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";

export async function acquireRecurringMaterializationLock(
  context: CurrentWorkspaceContext,
  db: DbExecutor,
) {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext('recurring_generated'), hashtext(${context.workspaceId}))`,
  );
}
