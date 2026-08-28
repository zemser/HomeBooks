# Reporting projection invalidation

`expense_events` is the reporting projection for classified transactions and manual entries.
`expense_allocations` is its month-level child projection. `shared_expense_splits` is user-owned
state attached to a projected event and must be removed when that event is no longer eligible.

Projection maintenance is synchronous and runs in the same database transaction as the source
mutation. Callers pass the transaction-scoped `DbExecutor`; they do not open a second transaction.
Auth, file parsing, Storage operations, network calls, and streaming work stay outside that
transaction.

## Owners and rebuild sources

| Derived table | Owner | Canonical rebuild source |
| --- | --- | --- |
| `expense_events` (`source_type = transaction`) | `syncTransactionExpenseEvents` | `transactions` joined to `transaction_classifications`; `transfer` and `ignore` are excluded |
| `expense_events` (`source_type = manual/recurring`) | `syncManualEntryExpenseEvents` | `manual_entries`; `source_type` maps one-time entries to `manual` and generated entries to `recurring`; `transfer` and `ignore` are excluded |
| `expense_allocations` | expense-event sync and allocation command | A single payment-date month by default; existing allocated-period rows are rebuilt from their stored allocation shape when the source amount changes |
| `shared_expense_splits` | shared-settlement command | User split definition attached to an eligible shared expense event; removed when its event is removed, and fixed splits are reset when a manual source amount changes |

## Mutation matrix

| Mutation | Affected source IDs / months | Required projection action | Atomicity |
| --- | --- | --- | --- |
| Single classification, including rule-applied matches | Requested transaction IDs | Sync only those transaction IDs; remove events when the resulting classification is `transfer` or `ignore` | Classification, rule changes, events, allocations, and stale split cleanup share one transaction |
| Bulk classification | Selected transaction IDs | Sync only selected transaction IDs | Classification batch and projections share one transaction |
| Classification undo | IDs stored in the decision batch | Restore classifications, then sync only batch IDs | Restore, projection update, and undo marker share one transaction |
| Import persistence | Newly inserted transaction IDs that received automatic classifications | Sync only automatically classified inserted IDs; unclassified rows have no event | File parsing/upload precede the short persistence transaction; transaction rows, classifications, projections, and import completion are atomic; Storage cleanup follows commit |
| One-time manual create/update/delete | The created, updated, or deleted manual-entry ID; old and new event months are affected on date changes | Sync that one ID; deletion or an excluded classification removes its event and child rows | Source mutation and projection maintenance share one transaction |
| Recurring materialization | Created, changed, and stale generated manual-entry IDs within the requested month range | Sync only the affected generated IDs; unchanged generated rows are not rewritten | Generated rows and projections share the materialization transaction and workspace lock |
| Recurring definition create/update/version | Months from the effective version boundary through the latest generated/current requested month | Materialize the bounded range, then sync only generated IDs that changed | Each materialization unit updates generated rows and projections atomically; definition writes do not span non-database work |
| Recurring definition deactivate/delete | Generated IDs from the deactivation boundary, or all generated IDs on delete | Delete generated rows and sync those IDs to remove their events and child rows | Generated-row deletion and projection cleanup share one transaction |
| Category rename | Classified transaction IDs and manual/generated IDs using the category | Sync exactly the discovered IDs so denormalized event labels and category IDs follow the canonical category | Category references, category row, and projections share one transaction |
| Allocation update | One transaction or one-time manual source ID | Ensure the event exists, then replace allocations only when the requested allocation state differs | Event and allocation changes share one transaction |
| Shared settlement update | One shared expense-event ID | Update the canonical transaction or manual/generated source payer, record a durable payer override for generated recurring occurrences, rebuild the event, and update split state | Source payer, recurring override, event projection, and split state share one transaction |
| Projection repair | Union of canonical source IDs and existing projected source IDs; all stored allocation months touched only when drift exists | Re-run both source syncs so missing rows are created and stale rows are removed | One explicit database transaction; safe to repeat |

## Read-path rule

Home and reporting page renders are projection consumers. They must not materialize recurring
entries, synchronize expense events, update timestamps, or recreate allocations. Explicit mutation
commands maintain projections; the repair command handles historical drift.

An authenticated workspace member can run the idempotent repair with
`POST /api/reporting/projections/repair`. The response reports the number of transaction and manual-entry
source IDs examined. The command unions canonical IDs with existing projected IDs, so it creates
missing projections and removes orphaned ones in the same RLS-scoped database transaction.
