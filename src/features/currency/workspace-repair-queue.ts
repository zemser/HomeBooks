import { sql } from "drizzle-orm";
import type { DbExecutor } from "@/db";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import type { FxRepairCursor } from "./backfill-imported-fx";
import type { FxRateKey } from "./rate-keys";

export type RepairPage = (
  context: CurrentWorkspaceContext,
  key: FxRateKey,
  cursor: FxRepairCursor | null,
) => Promise<{ nextCursor: FxRepairCursor | null }>;

export async function enqueueWorkspaceRepairs(db: DbExecutor, key: FxRateKey) {
  // Finish the current pass before checking for new sources behind its cursor.
  await db.execute(sql`insert into app.fx_workspace_repairs (workspace_id,base_currency,quote_currency,year_month)
    select "workspaceId",${key.baseCurrency},${key.quoteCurrency},${key.yearMonth}::date
    from app.fx_repair_workspaces(${key.baseCurrency},${key.quoteCurrency},${key.yearMonth}::date)
    on conflict (workspace_id,base_currency,quote_currency,year_month)
    do update set rescan_requested=true where fx_workspace_repairs.cursor_id is not null and not fx_workspace_repairs.rescan_requested`);
}

type Job = FxRateKey & {
  rescan: boolean;
  workspaceId: string;
  cursorId: string | null;
  cursorKind: FxRepairCursor["kind"] | null;
};

export async function drainWorkspaceRepairPage(
  db: DbExecutor,
  repairPage: RepairPage,
) {
  // Hold just this private queue row while the app commits the household page under RLS.
  // If the worker exits between commits, the same page can be replayed idempotently.
  return db.transaction(async (tx) => {
    const [job] = (
      await tx.execute<Job>(sql`
      select workspace_id as "workspaceId",base_currency as "baseCurrency",quote_currency as "quoteCurrency",
        year_month::text as "yearMonth",cursor_id as "cursorId",cursor_kind as "cursorKind",rescan_requested as rescan
      from app.fx_workspace_repairs where available_at<=clock_timestamp()
      order by available_at,workspace_id limit 1 for update skip locked`)
    ).rows;
    if (!job) return { claimed: 0, completed: 0 };
    const key = sql`workspace_id=${job.workspaceId} and base_currency=${job.baseCurrency}
      and quote_currency=${job.quoteCurrency} and year_month=${job.yearMonth}::date`;
    const [context] = (
      await tx.execute<CurrentWorkspaceContext>(sql`
      select * from app.fx_repair_workspaces(${job.baseCurrency},${job.quoteCurrency},${job.yearMonth}::date,${job.workspaceId}::uuid)`)
    ).rows;
    let next: FxRepairCursor | null = null;
    if (context) {
      const cursor =
        job.cursorId && job.cursorKind
          ? { id: job.cursorId, kind: job.cursorKind }
          : null;
      try {
        next = (await repairPage(context, job, cursor)).nextCursor;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Workspace FX repair failed";
        await tx.execute(sql`update app.fx_workspace_repairs set attempts=attempts+1,failed_at=now(),last_error=${message},
          available_at=clock_timestamp()+interval '1 minute' * power(2,least(attempts,10)) where ${key}`);
        return { claimed: 1, completed: 0 };
      }
    }
    if (!next && !(context && job.rescan)) {
      await tx.execute(sql`delete from app.fx_workspace_repairs where ${key}`);
      return { claimed: 1, completed: 1 };
    }
    await tx.execute(sql`update app.fx_workspace_repairs set cursor_id=${next?.id ?? null},cursor_kind=${next?.kind ?? null},
      rescan_requested=${Boolean(next) && job.rescan},
      available_at=clock_timestamp(),attempts=0,last_error=null,failed_at=null where ${key}`);
    return { claimed: 1, completed: 0 };
  });
}
