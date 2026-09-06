# TUNING-001 index evidence

Date: 2026-08-14
Status: Waived — no new index migration is justified by the available evidence.

## Decision

Do not add an index in TUNING-001. The current local database has the indexes
that match the measured high-use query shapes, and the remaining candidate
gaps are not performance problems at the current data volume. The historical
Supabase advisor findings are therefore waived for this slice rather than
being converted into blanket foreign-key indexes.

This is a measurement waiver, not a claim that every advisor recommendation is
unimportant at larger scale. Revisit the candidates after a hosted,
production-shaped `EXPLAIN (ANALYZE, BUFFERS)` run.

## Query and index evidence

Checks used the local Supabase/Postgres database only. The server was
PostgreSQL 17.6. At the time of measurement the relevant row counts were:

| Table | Rows |
| --- | ---: |
| `workspaces` | 1 |
| `workspace_members` | 1 |
| `transactions` | 100 |
| `transaction_classifications` | 12 |
| `expense_events` | 12 |
| `expense_allocations` | 12 |
| `imports` | 2 |
| `manual_entries` | 0 |
| `manual_recurring_expenses` | 0 |

Representative query shapes were traced to:

- `src/features/expenses/queries.ts`: workspace transaction/review queue
  reads, recent classifications, and import summaries.
- `src/features/reporting/expense-events.ts`: projection lookups by
  `(workspace_id, source_type, source_id)` and date-range scans.
- `src/features/expenses/allocation.ts`: allocation lookups by event/source.
- `src/features/imports/persistence.ts`: completed-import ordering and
  classification-rule loading.
- `src/features/workspaces/current-context.ts`: active membership lookup by
  `(user_id, is_active)`.

The following read-only checks used `EXPLAIN (ANALYZE, BUFFERS)`:

| Shape | Plan evidence | Execution |
| --- | --- | ---: |
| Review queue: workspace filter, unclassified left join, newest first | Sequential scan of 100 `transactions` rows plus 12-row classification hash join; final sort | 0.469 ms |
| Active membership: user and `is_active` | Sequential scan of one `workspace_members` row | 0.160 ms |
| Expense projection lookup: workspace, source type, source IDs | Sequential scan of 12 `expense_events` rows; hash semi-join to transaction IDs | 0.100 ms |
| Saved imports: workspace, completed bank imports, newest first | Backward index scan using `imports_workspace_type_created_idx`; status applied as a filter | 0.040 ms |
| Projection date range: workspace and transaction date window | Sequential scan of 100 `transactions` rows because the range matched the local dataset | 0.059 ms |
| Active exact classification rules ordered by priority | Index scan using `classification_rules_workspace_priority_idx`; incremental sort only for the secondary timestamp | 0.067 ms |
| Allocation lookup by event IDs | Sequential scan of 12 `expense_allocations` rows; the existing event index was not worthwhile at this size | 0.069 ms |

The existing schema already covers the important equality and foreign-key
paths with indexes including:

- `transactions_workspace_date_idx`
- `transactions_workspace_dedupe_idx`
- `transactions_import_idx`
- `transaction_classifications_transaction_id_unique`
- `expense_allocations_event_idx`
- `shared_expense_splits_expense_event_id_unique`
- `imports_workspace_type_created_idx`
- `classification_rules_workspace_priority_idx`
- `manual_entries_workspace_event_date_idx`
- `workspace_categories_workspace_sort_idx`

The prior investigation also found that the dominant production wait was
per-user advisory-lock serialization, not slow table access. That path has
already been addressed by the earlier refactor work; the advisor's
foreign-key recommendations were explicitly noted as future-scale work when
the measured tables were tiny.

## Revisit criteria

Reopen this waiver when a hosted or production-shaped dataset provides any of
the following:

1. `expense_events` source lookups show sustained sequential scans with
   material execution time; candidate index:
   `(workspace_id, source_type, source_id)`.
2. Active membership resolution is materially measurable at scale; candidate
   index: `(user_id, is_active)`.
3. Review-queue ordering becomes a measurable sort cost; candidate index:
   `(workspace_id, transaction_date, created_at)`.
4. The saved-import query becomes a measurable status-filter cost; compare a
   status-inclusive composite index against the existing
   `imports_workspace_type_created_idx`.

Any future index must be added through a reviewed Drizzle migration and
verified with before/after plans and application-level latency evidence.
