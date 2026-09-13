# Shared spending scope specification

## Status

Accepted for implementation. There are no production users, so this is a breaking simplification, not a compatibility shim.

This document is the source of truth for spending scope. It supersedes the personal / shared / household vocabulary in `docs/focused-budgeting-experience-spec.md`. Update that spec, export copy, and related docs in the same change.

Do not start other product work in this change. Do not redesign Home, Transactions IA, auth, or RLS policy shape.

## Decision

Review asks **whose spending this is**, then **what it was for**, then optionally **whether to settle it**.

Those are three different questions. They were being mixed:

- `personal` and `shared` already answer whose spending
- `household` was a second name for shared spending, plus a hidden “do not settle” flag
- category already answers rent vs groceries vs dining
- settlements already need an explicit split, but every `shared` row was forced into that queue

Keep one joint spending type. Call it **Shared**. Remove **Household** as a classification.

Shared means “this counts as both of ours,” not “we will settle this.” Settling is a separate opt-in on a shared expense.

## Product vocabulary

Keep these concepts distinct.

### Classification type

How the transaction is treated:

| Type | Meaning | Reportable spending |
| --- | --- | --- |
| `personal` | Counts as one member’s spending | Yes |
| `shared` | Counts as both members’ spending | Yes |
| `income` | Money received | Income, not spending |
| `transfer` | Movement between own accounts | No |
| `ignore` | Exclude | No |

There is no `household` type.

### Personal owner

Required when the type is `personal`. The member whose personal spending includes the expense.

### Payer

Optional on `personal` and `shared`. Who paid. Independent of whose spending it is.

Examples:

- Lee pays for Izzy’s headphones: personal, owner Izzy, payer Lee. Not a settlement.
- Izzy pays the electricity bill: shared, payer Izzy, split off.
- Lee pays for a dinner they want to balance: shared, payer Lee, split on.

### Category

What the money was spent on. Independent of type and of split. Housing as a category does not make a row shared, and shared does not imply Housing.

### Split for settlement

A boolean on a **shared** expense only. Default **off**.

- Off: ordinary shared spending. Rent, groceries, most house bills. Visible in reports. Absent from settlements.
- On: the user wants this in shared balances. It appears in Settlements as “needs split setup” until payer and split rules are confirmed. Rules and review never invent equal/percentage/fixed split definitions.

Personal, income, transfer, and ignore cannot be split. “Lee paid for Izzy’s personal thing” stays owner-versus-payer attribution. It does not enter settlements.

## Why Shared, not Household

The remaining joint type has to cover rent, the weekly shop, and a date night. **Shared** is that umbrella. **Household** sounds like bills, collides with “household workspace,” and duplicates the Housing category.

Review copy must say so:

- Personal — Counts as one person’s spending
- Shared — Counts as both of yours
- Income — Money received
- Transfer — Movement between your accounts
- Ignore — Exclude from spending reports

Split control copy, shown only for shared when the workspace has at least two active members:

- Label: `Split this later`
- Helper: `Adds this to shared balances. Leave off for ordinary shared spending like rent or groceries.`

Do not describe shared as “a cost with a known payer.” Payer is a separate field.

## Current state reviewed

- Latest Drizzle migration is `0015_workspace_invite_identity`. Generate the next migration with `npm run db:generate` after schema edits. Do not invent a filename by hand and do not use `drizzle-kit push`.
- `classification_type` enum is `personal | shared | household | income | transfer | ignore` on classifications, rules, manual entries, recurring definitions, and `expense_events`.
- Reports, Home, yearly export, and the category-by-scope matrix all emit a Household bucket. Reconciliation is `personal + shared + household = total spent`.
- Settlements list every `expense_events` row with `classification_type = 'shared'`, including rows with no `shared_expense_splits` yet. Household never appears there. Confirmed splits are still created only on the Settlements page.
- Recurring and one-time manual expense forms default new expenses to `household`.
- Review keyboard `1`–`6` maps onto the six-type array. Shortcuts and e2e coverage assume Household is key `3`.
- Merchant rules store type and category, not people, and never create split definitions. A `shared` rule currently makes later matches settlement-eligible by type alone.
- Payer validation treats `household` like `shared`: optional payer, no personal owner.
- `normalizeClassificationForEventKind` falls back invalid expense types to `household`.
- Undo batches persist two JSON collections: `previousClassifications[].classification` and `previousRules`. Both can contain `classificationType` / `defaultClassificationType`. They do not snapshot `shared_expense_splits`.
- Expense-event sync today deletes split rows when the expense event is deleted, and when a manual shared event’s fixed split total changes. It does not delete them merely because the classification type changed. Settlements already no-op when the workspace is not a two-active-member pair; deactivating a member does not clear split rows.
- RLS already covers the affected tables. Adding a boolean does not require new policies. Do not add `security definer` functions.

## Target application contract

### Classification types

```ts
export const CLASSIFICATION_TYPES = [
  "personal",
  "shared",
  "income",
  "transfer",
  "ignore",
] as const;
```

Keyboard shortcuts become `1`–`5` in that order. Income is `3`, transfer `4`, ignore `5`.

Manual entry expense types are `personal | shared`. Income entries stay `income`.

### Member attribution

Unchanged from Phase 5, minus household:

- personal: personal owner required; payer optional; recipient null
- shared: personal owner null; payer optional; recipient null; `splitForSettlement` optional boolean, default false
- income: recipient optional; payer and personal owner null; split false
- transfer / ignore: all member fields null; split false

`classificationAllowsPayer` is personal and shared only.

### Split for settlement

Application field name: `splitForSettlement`.

Postgres column name: `split_for_settlement`, boolean not null default false.

Allowed true only when `classification_type = 'shared'`. Writes that set it on any other type are rejected. Changing a row away from shared must force the flag false.

Expense-event sync copies the flag from the source row. Settlements query:

```text
classification_type = 'shared' AND split_for_settlement = true
```

Do not treat “shared with a payer” as a split. Do not auto-insert `shared_expense_splits` when the checkbox is turned on. The Settlements page remains where equal / percentage / fixed rules are confirmed.

Split-definition lifetime:

- Turning split **off** must not delete a confirmed `shared_expense_splits` row. The flag is membership in the settlements queue. The split rules and `open` / `settled` / `ignored` status stay on the event, unused, until split is turned on again or the type is no longer shared.
- Changing the type **away from shared**, or deleting the source event, deletes the split row. Classification undo must restore that row. See [Undo](#undo).
- Manual and recurring editors have no undo. Tell the user that changing those entries away from shared drops confirmed split tracking. Do not invent a second undo system for this change.

### Merchant rules

Rules store `default_split_for_settlement` in addition to type and category. They still do not store people and still do not create split definitions.

| Saved rule | New match |
| --- | --- |
| Shared, split off | Shared, payer from account owner, not in settlements |
| Shared, split on | Shared, payer from account owner, appears in Settlements needing split setup |
| Personal | Personal owner and payer from account owner |

If the account has no owner, person-bearing types stay in review, matching the current rule-reuse spec.

### Reporting and export

`SpendingScope` is `"personal" | "shared"`.

Home, monthly report, yearly report, and export emit:

- Personal · each relevant member
- Shared
- no Household column, card, or matrix cell

Reconciliation:

```text
personal totals across members + shared = total expenses
```

Category still crosses with scope. Groceries can be personal or shared. Shared groceries and shared rent both land in Shared; the category row distinguishes them.

### Defaults

- New review / bulk / history classification: split off
- New one-time manual expense: `shared`, split off
- New recurring expense: `shared`, split off
- Invalid expense type fallback: `shared`, not `household`

### One-member workspaces

Historical split state is preserved. Settlements stay disabled until there are two active members. Do not clear flags, rules, recurring definitions, or `shared_expense_splits` when the roster drops to one person.

| Path | Split true allowed? |
| --- | --- |
| Interactive review / bulk / history / manual / recurring **save** | No. Hide the control. If a client sends true, reject it. |
| Backfill of existing `shared` in a workspace that currently has ≥2 active members | Yes. Those rows are already in today’s settlements queue. |
| Backfill of existing `shared` in a workspace that currently has 1 active member | No. That workspace never had a pair to settle with; old `shared` there was “not personal,” not settlement intent. |
| Backfill of `household` | Always false. |
| Membership deactivation or reactivation | Do not rewrite flags or split rows. |
| Rule replay, recurring generation, undo | Copy the stored flag. Do not strip true because the roster is currently one person. |

A one-member workspace that later adds a partner must not dump years of “not personal” shared spend into Settlements. That is why backfill is the one place member count is allowed to interpret old `shared`. After backfill, leave the data alone.

The Settlements page already blocks when the workspace is not a pair. Keep that empty state. Do not show a fake zero balance.

## Schema

Add the boolean beside existing columns. Remove `household` from the Postgres enum after backfill.

### Columns

Add `split_for_settlement boolean not null default false` to:

- `transaction_classifications`
- `classification_rules` as `default_split_for_settlement`
- `manual_entries`
- `manual_recurring_expenses`
- `expense_events`

### Constraints

Replace every `classification_type IN ('shared', 'household')` check with `'shared'`.

Add a split check on each source table and `expense_events`:

```sql
split_for_settlement = false
OR classification_type = 'shared'
```

Rules use `default_split_for_settlement` with the same rule against `default_classification_type`.

### Enum

After every household row is rewritten to shared:

1. recreate `classification_type` without `household`
2. repoint every column that uses it
3. drop the old enum

Do not leave a dead `household` value that application code can still write. If `drizzle-kit` generates a destructive enum change, hand-edit the SQL so existing rows survive the backfill. Do not use `db:push`.

### Undo JSON

See [Undo](#undo). New snapshots store `splitForSettlement` on classifications and `defaultSplitForSettlement` on rules. They also store any `shared_expense_splits` that the write is about to delete.

## Backfill

Run the backfill in the generated migration, then rebuild `expense_events` from source rows.

Use one mapping helper for type. Split inference depends on whether a flag is already stored.

| Existing type | After | `split_for_settlement` when the flag is absent |
| --- | --- | --- |
| `household` | `shared` | `false` |
| `shared` | `shared` | `true` if the workspace currently has ≥2 active members; `false` if it has 1 |
| `personal` / `income` / `transfer` / `ignore` | unchanged | `false` |

The same type mapping applies to `transaction_classifications`, `manual_entries`, `manual_recurring_expenses`, `classification_rules` (`default_classification_type` / `default_split_for_settlement`), and `expense_events`.

Why existing two-member `shared` becomes split-on: those rows are already in the settlements queue today. Do not silently drop them from balances.

Why existing one-member `shared` becomes split-off: there was no pair to settle with. Treating that as settlement intent would flood Settlements the day a second member joins.

Why existing `household` becomes shared split-off: they were joint spending that was never settleable. Do not dump rent and utilities into Settlements.

Do not rewrite these flags again after backfill, including on member deactivation.

Keep existing `shared_expense_splits` rows on events that remain `shared`, including one-member rows whose flag is now false. Delete split rows that still point at a former household event; those were never supposed to exist. Do not create split definitions.

Expense-event rebuild:

- `classification_type` from the source type after mapping
- `split_for_settlement` from the source flag
- personal owner, payer, recipient, category, allocations unchanged
- do not create split definitions
- do not delete split rows on events that remain `shared`

## UI

Keep the existing review, history, recurring, and manual-entry surfaces. Remove Household from every classification picker.

| Type | Extra controls |
| --- | --- |
| Personal | Whose personal expense? (required), Paid by (optional) |
| Shared | Paid by (optional), Split this later (optional, two-member workspaces only) |
| Income | Received by (optional) |
| Transfer / ignore | none |

Show the split checkbox on:

- Review single save
- Review bulk classify
- History / all-transactions classification editor
- One-time manual expense create/edit
- Recurring expense create/edit

Merchant-rule checkbox copy stays type + category. If the saved type is shared, include the split flag in the stored rule and in the preview line, for example `Shared / Groceries` or `Shared, split later / Dining`.

Settlements copy should say that only expenses marked **Split this later** appear there. “Needs split setup” is the queue of opted-in shared rows that still lack a confirmed split, not every shared expense.

Do not add Household aliases, badges, or report filters.

## Application writes

Update every household branch and every settlements eligibility check.

Likely files:

- `src/features/expenses/constants.ts`
- `src/features/expenses/payer.ts`
- `src/features/expenses/presentation.ts`
- `src/features/expenses/classifications.ts`
- `src/features/expenses/suggestions.ts`
- `src/features/imports/persistence.ts`
- `src/features/manual-entries/constants.ts`
- `src/features/manual-entries/service.ts`
- `src/features/recurring/service.ts`
- `src/features/reporting/expense-events.ts`
- `src/features/reporting/monthly-report.ts`
- `src/features/reporting/export.ts`
- `src/features/shared-settlements/service.ts`
- `src/app/api/transaction-classifications/route.ts`
- `src/app/api/transaction-classifications/bulk/route.ts`
- review, history, recurring, and settlement clients
- `src/components/expenses/classification-type-picker.tsx`
- `src/components/expenses/member-attribution-fields.tsx` or a sibling split checkbox

Reject `household` in Zod enums. Do not keep a long-lived request alias.

When a write changes type away from shared, or deletes the source, delete the matching `shared_expense_splits` row during expense-event sync. When a write only turns split off, leave the split row in place.

## Undo

Undo is a classification-batch feature. It must restore spending type, split flag, merchant rule, and any confirmed split that the undone write removed.

### What to snapshot

On classify / bulk classify / rule save, the batch already stores `previousClassifications` and `previousRules`. Extend both with the split flag. Also store `previousSplits` for every affected expense event that currently has a `shared_expense_splits` row, **before** sync runs.

`previousSplits` must include `expenseEventId` / source identity, `splitMode`, `splitDefinitionJson`, and `settlementStatus`. Restoring only `splitForSettlement: true` is not enough: that would put a previously confirmed dinner back into “needs split setup” and change the open balance.

Turning split off does not delete the split row, so restoring the flag is sufficient for that path. Changing shared to personal (or transfer / ignore / income) does delete it, so undo must insert the snapshot back after expense-event sync recreates or updates the event. Match on source id, not on a stale expense-event id if sync replaced the event.

Manual and recurring saves are not undoable. Out of scope.

### Legacy snapshots

Open undo batches survive the migration as JSON. They are not rewritten by the enum backfill. Both `previousClassifications` and `previousRules` must run through the same normalizer before insert, or undo will try to write the removed `household` enum value.

```ts
function normalizeLegacyScope(snapshot: {
  classificationType: string;
  splitForSettlement?: boolean | null;
}): { classificationType: ClassificationType; splitForSettlement: boolean }
```

Rules use `defaultClassificationType` / `defaultSplitForSettlement` with the same rules.

| Snapshot | Result |
| --- | --- |
| `household`, flag absent | `shared`, split false |
| `shared`, flag absent | `shared`, split true |
| any mapped type, flag present | mapped type, stored flag unchanged |
| `personal` / `income` / `transfer` / `ignore`, flag absent | unchanged type, split false |

Do not apply the one-member backfill exception here. Undo restores a point in time. Membership at undo time must not rewrite it. A one-member workspace may therefore have `split_for_settlement = true` after undoing a legacy shared snapshot. Settlements stay blocked until a second member exists.

Expire nothing. Invalidating every open batch is simpler and wrong: it would surprise anyone mid-review during the deploy, including local/dev data.

## Docs to update in the same change

Rewrite spending-scope language so later work does not resurrect Household:

- `docs/focused-budgeting-experience-spec.md` — vocabulary, review journey, Home/report totals, reconciliation, export columns, test plan
- `docs/merchant-rule-reuse-spec.md` — drop household from type tables; rules may store the split flag but still never create split definitions
- `docs/database-schema.md` and `docs/schema-reference.md` — enum and new column
- `docs/product-structure.md` — “spent together” is shared; household operating cost is a category, not a type

Leave completed Phase 4–7 handoffs as historical. Do not rewrite them as if Household never existed.

## Implementation sequence

1. Add `split_for_settlement` columns and CHECKs in `src/db/schema.ts`, generate `0016_*`, and put backfill, enum recreation, and expense-event rebuild in that SQL.
2. Remove `household` from application constants, payer validation, Zod enums, and the invalid-type fallback.
3. Thread `splitForSettlement` through classification, bulk, rule, suggestion, manual, recurring, undo, and expense-event sync. Snapshot `previousSplits` before sync. Dual-write nothing; there is no compatibility type.
4. Point settlements eligibility at shared + split. Keep split-definition confirmation on the Settlements page. Do not clear split data on member deactivation.
5. Drop Household from reports, Home, year averages, and export. Change reconciliation tests to personal + shared.
6. Update pickers, copy, keyboard `1`–`5`, defaults, and the split checkbox. Hide split in one-member workspaces.
7. Update unit, review, export, and Playwright coverage. Run lint, focused tests, and a production build.

## Required test coverage

Replace household assertions. Do not keep a “household is still accepted” path.

Update:

- `tests/review/payer.test.ts` — shared may have a payer; split true rejected on personal / income / transfer / ignore; split false is the shared default
- `tests/review/spending-scope-reporting.test.ts` — one-member and two-member reports have personal buckets plus Shared only
- `tests/review/year-reporting.test.ts` and `tests/review/report-export.test.ts` — no `household` column
- `tests/e2e/report-export.spec.ts` — header is `shared,total_spent,savings` after the personal columns
- `tests/e2e/review-workflow.spec.ts` — five types; split checkbox; shortcuts `1`–`5`
- suggestion, merchant-rule, classification, and review-filtering tests that seed `household`

Add focused tests for:

- classifying as shared does not create a settlement row
- shared + split on appears in settlements `needsSplitSetup` without a `shared_expense_splits` row
- shared + split off is absent from settlements even when a payer is set
- turning split off hides the expense from settlements and **keeps** the confirmed split definition
- confirmed split → split off → undo → original split rules, status, and open balance restored
- changing shared-split to personal deletes the split definition
- shared-split → personal → undo → original split rules, status, and open balance restored
- backfill: household → shared / split false
- backfill: two-member shared → shared / split true
- backfill: one-member shared → shared / split false
- backfill: existing confirmed splits on old two-member shared events still attach
- household merchant rules become shared with split false
- two-member shared merchant rules become shared with split true
- auto-applied shared-split-on match lands in settlements setup, not as a confirmed balance
- undo restores `splitForSettlement` on classifications
- undo of a legacy `household` classification snapshot writes `shared` / split false
- undo of a legacy `household` **rule** snapshot writes `shared` / split false
- undo of a legacy `shared` snapshot with no flag writes split true
- undo of a snapshot that already stored a flag keeps that flag
- interactive one-member save rejects split true
- one-member deactivation does not clear existing split-true rows or confirmed splits
- rule replay / recurring generation in a one-member workspace still copies a stored split-true flag
- personal owner vs payer still cannot enter settlements
- Home / monthly report / year export totals still reconcile after Household is gone

Keep completeness, scope-reconciliation-without-household, and review-keyboard tests green.

If a SQL backfill test is impractical in the review harness, inspect the migration SQL and test a shared mapping helper that the migration uses. Prefer one canonical mapping over duplicated CASE SQL.

## Verification commands

```bash
npm run lint
npm run test:review
npm run test:e2e -- tests/e2e/review-workflow.spec.ts tests/e2e/report-export.spec.ts
npm run build
```

If settlements have a focused spec, run it too. Apply `0016_*` the same way this repo already applies Drizzle SQL.

## Acceptance checklist

- [ ] Review, history, bulk, manual, and recurring can no longer choose Household.
- [ ] Shared means both members’ spending. Category is still chosen separately.
- [ ] Split this later is off by default and is the only way a shared expense enters settlements.
- [ ] Existing household rows report as shared and do not appear in settlements.
- [ ] Existing two-member shared rows remain settlement-eligible, including confirmed splits.
- [ ] Existing one-member shared rows become shared and are not settlement-eligible.
- [ ] Reports, Home, and export have no Household bucket. Personal + shared = total spent.
- [ ] Merchant rules remember shared vs shared-split, and still do not create split definitions.
- [ ] Keyboard shortcuts are `1`–`5`.
- [ ] One-member workspaces hide split and reject new interactive writes that set it true. Historical split-true rows, rules, recurring generation, and undo are left intact. Settlements stay blocked.
- [ ] Classification undo restores confirmed split definitions, not only the flag. Legacy household values in `previousClassifications` and `previousRules` cannot be written back.
- [ ] `household` is gone from application types and from the Postgres enum.
- [ ] Focused tests, lint, and build pass, aside from documented pre-existing failures.

## Agent brief

Implement this spec end to end. Read Next.js docs under `node_modules/next/dist/docs/` only if a route or Server Action changes. Prefer extending `payer.ts` and expense-event sync over a parallel settlement model. Do not keep a `household` write path. Do not infer split from category or from payer. Do not auto-create split definitions. Do not delete a confirmed split just because the flag was turned off. Do not clear settlement data when a workspace becomes one member. Do not put shared spend into a personal bucket. Verify backfill, undo of confirmed splits, legacy snapshot normalization on both collections, report reconciliation, and review keyboard behavior before declaring the change complete.
