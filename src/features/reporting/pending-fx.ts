import { sql } from "drizzle-orm";
import type { DbExecutor } from "@/db";

export type PendingFxAmount = { currency: string | null; amount: string; count: number };

export function describePendingFx(amounts?: PendingFxAmount[]) {
  return amounts?.map(({ currency, amount, count }) =>
    currency ? `${currency} ${amount} awaiting conversion (${count})` : `${count} awaiting currency confirmation`,
  ).join(" · ") ?? "";
}

export async function pendingFxByMonth(db: DbExecutor, workspaceId: string, start: string, end: string) {
  const { rows } = await db.execute<PendingFxAmount & { month: string }>(sql`
    select date_trunc('month', day)::date::text as month, currency,
      sum(abs(amount))::text as amount, count(*)::int as count
    from (
      select t.transaction_date as day, t.settlement_currency as currency,
        coalesce(t.settlement_amount, t.original_amount) as amount
      from transactions t left join transaction_classifications c on c.transaction_id = t.id
      where t.workspace_id = ${workspaceId} and t.transaction_date >= ${start} and t.transaction_date < ${end}
        and coalesce(c.classification_type::text, '') not in ('ignore','transfer')
        and (t.valuation_state = 'pending' or t.normalization_rate_source = 'missing-monthly-rate')
      union all
      select event_date, original_currency, original_amount from manual_entries
      where workspace_id = ${workspaceId} and event_date >= ${start} and event_date < ${end}
        and classification_type not in ('ignore','transfer') and valuation_state = 'pending'
    ) pending group by 1, 2 order by 1, 2
  `);
  const byMonth = new Map<string, PendingFxAmount[]>();
  for (const { month, currency, amount, count } of rows) {
    const group = byMonth.get(month) ?? [];
    group.push({ currency, amount, count });
    byMonth.set(month, group);
  }
  return byMonth;
}
