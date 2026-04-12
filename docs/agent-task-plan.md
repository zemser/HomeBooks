# Finance App Agent Task Plan

## Goal

Break the implementation into clear, parallelizable tasks so multiple agents can work on the app without colliding.

This plan follows the current implementation order and the current repo state.

## Current state

Already in place:

- product, architecture, schema, and implementation docs
- Next.js scaffold
- Drizzle schema and baseline migration
- import preview API
- non-interactive ESLint setup
- seeded dev workspace bootstrap:
  - default user
  - default workspace
  - default workspace member
  - default base currency resolution
- persisted bank import flow:
  - saved import records
  - local file retention
  - staged raw import rows
  - normalized transaction persistence
  - checksum-based duplicate import protection
  - saved imports list API
- initial parser support for:
  - Max credit-card statements
  - Cal card exports
  - Cal recent-transactions reports
- transaction list page on persisted imports
- review queue and classification workflow
- merchant rule persistence and reuse on future imports
- recurring rule CRUD with future-dated versions
- recurring-generated manual entries
- one-time manual expense and income entry CRUD inline on `/expenses`
- one-time manual shared-expense settlement coverage:
  - shared manual expenses appear in `/settlements`
  - equal, percentage, and fixed split rules work for manual shared expenses
  - fixed splits reset when tracked manual expense amounts change
- investment snapshot persistence sidecar for Excellence:
  - dedicated `/investments` upload, preview, and save flow
  - typed holdings preview contract
  - confirmed owner/account save contract
  - persisted `investment` imports plus local file retention
  - `investment_accounts` resolution and `holding_snapshots` persistence
  - investment-only import history inside `/investments`
  - latest active holdings view grouped by investment account
  - helper guidance when a workbook is missing a parsed account label
  - portfolio summary strip built from latest active holdings
  - account overview cards with portfolio share, top holding, concentration hints, and cost-basis coverage
- reports page backed by classified imports and recurring/manual entry inputs
- year-to-date and rolling 12-month reporting
- dashboard cards backed by real reporting data
- `expense_events` and `expense_allocations` materialized for reportable sources
- payment-date and adjusted-period reporting modes
- transaction allocation editing in the review flow with equal and manual splits
- shared-settlement flow for pairwise v1:
  - explicit split setup on classified shared expense events
  - equal, percentage, and fixed split rules
  - open, settled, and ignored statuses
  - running open balance summary
- workspace settings polish with:
  - guarded base-currency editing
  - owner/member role updates
  - member deactivation guardrails
  - settlement-readiness guidance in `/settings`
- shared workflow shell and home hub:
  - DB-backed `/` home with setup, next-action, review, and reporting cues
  - persistent desktop sidebar and compact mobile navigation
  - page-level workflow links between settings, imports, review, expenses, recurring, reports, settlements, and investments
  - `/dashboard` redirected into `/`
- expense-workflow dogfooding pass with real example imports:
  - import history now shows reviewed vs pending counts and stronger post-save next actions
  - review queue now shows reviewed/remaining/progress cues and remaining-by-import context
  - `/expenses` now has imported-ledger search and filtering plus cleaner handoff into reports
  - saved one-time manual entries are easier to reopen from the ledger surface
  - placeholder-normalized foreign-currency rows are now explicitly labeled across imports, review, ledger, reports, and home follow-up cues
  - queue-cleared states now hand off more clearly into the matching report month from review, ledger, and `/`

Not built yet:

- one more narrow expense-path polish pass after another round of real-file use
- simple investment composition surfaces on top of saved holdings
- investment activity import support once we have a real activity export sample
- durable import-file storage for hosted deployment
- auth

## Recommended next slice

Keep the next pass deliberately small and expense-first:

1. one more real-file expense dogfooding pass
2. fix only the remaining expense affordance gaps that still show up there
3. only then consider investment composition follow-ups

That translates into the following agent-friendly tasks:

### Task A: Remaining expense-path polish after the FX pass

Ownership:

- `src/app/page.tsx`
- `src/app/reports/**`
- `src/app/expenses/**`
- `src/app/imports/review/**`
- `src/components/expenses/**`
- `src/components/imports/**`
- `src/features/home/**` only if another workflow cue still needs tightening

Responsibilities:

- run the workflow again with real imports and confirm the latest cues are actually obvious
- fix any remaining manual-entry, ledger, or report-handoff friction without reopening schema work
- preserve the new FX transparency and queue-cleared guidance rather than reworking them

### Task B: Investment follow-ups only after A

Ownership:

- `src/app/investments/**`
- `src/components/investments/**`
- `src/features/investments/**`

Responsibilities:

- keep to lightweight composition improvements on top of saved holdings
- do not let investment work pull focus from the expense MVP

## Workstream map

The best split is into 6 workstreams:

1. platform foundation
2. import persistence
3. transaction review and classification
4. recurring entries
5. reporting and dashboard
6. investment import foundation

These should remain in one monorepo, but different agents can own different write scopes.

## Recommended order

Critical path:

1. platform foundation
2. import persistence
3. review and classification
4. recurring entries
5. reporting

Parallel sidecar:

- investment import foundation can begin earlier as long as it does not block expense MVP

## Developer validation checkpoint

Status:

- completed on local Docker PostgreSQL

Validated:

1. `npm run db:push` succeeds against a real PostgreSQL database
2. `npm run dev` boots against the live database
3. the seeded dev workspace bootstrap succeeds automatically
4. concurrent first-load requests no longer race into duplicate seed inserts
5. `/settings`, `/expenses`, `/recurring`, and `/reports` load against the live DB
6. one-time manual entry CRUD plus allocation editing from `/expenses` work end-to-end
7. dynamic GET routes now refresh correctly after mutations
8. `npm run lint` and `npm run build` pass after the runtime fixes
9. a manual smoke pass from `/` through `/imports`, `/imports/review`, `/expenses`, `/recurring`, and `/reports` works against the live DB

Definition of done:

- the app boots against a real database without manual seed scripts
- the default dev workspace context is created automatically
- manual entry CRUD and allocation editing work end-to-end
- the main reporting pages load without runtime DB errors

Follow-up still optional:

- repeat the expense smoke pass with more real files, especially ones containing foreign-currency rows

Deployment note:

- use local Docker PostgreSQL for the first integration checkpoint
- if we deploy on Vercel later, Neon is the default hosted-Postgres recommendation when we only need a database
- Supabase remains a valid option if we later want auth, storage, or realtime from the same provider
- the current import flow still writes files to local disk, so Vercel deployment needs a durable upload-storage follow-up before import-heavy production usage
- auth remains part of the roadmap, and this early database recommendation does not commit us to any auth provider yet

## Agent assignments

## Agent 1: Platform Foundation

Ownership:

- `src/db/**`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/settings/**`
- environment and setup config only if required

Responsibilities:

- wire real DB client usage
- create first migrations from current schema
- add workspace bootstrap model and seed path if needed
- create workspace settings page for base currency and members

Deliverables:

- migration generation works
- workspace tables are usable
- base currency can be set in the app

Dependencies:

- none

Can run in parallel with:

- Agent 6

Should avoid touching:

- `src/features/imports/**`
- `src/components/imports/**`
- `src/app/imports/**`

## Agent 2: Import Persistence

Ownership:

- `src/features/imports/**`
- `src/components/imports/**`
- `src/app/imports/**`
- `src/app/api/imports/**`
- small helper additions under `src/lib/tabular/**` or `src/lib/excel/**`

Responsibilities:

- persist uploaded import metadata
- persist parsed import rows
- create save-import action after preview
- normalize preview rows into real transaction records
- dedupe repeated imports

Deliverables:

- upload file
- preview import
- confirm import
- store import record and normalized transactions

Dependencies:

- Agent 1 should provide working DB migrations and workspace base currency

Can run in parallel with:

- Agent 6

Should avoid touching:

- recurring pages
- report pages
- transaction review UI unless needed for import completion

## Agent 3: Review and Classification

Ownership:

- `src/features/expenses/**`
- `src/app/expenses/**`
- `src/app/imports/review/**`
- related reusable UI under `src/components/**`

Responsibilities:

- transaction list page
- review queue page
- manual classification edits
- classification rules
- bulk actions
- transaction allocation editing for imported rows

Deliverables:

- user can review uncertain transactions
- user can classify personal/shared/household/income
- user can save merchant rules
- user can switch a reviewed transaction between payment-date, equal-split, and manual-split allocation modes

Dependencies:

- Agent 2 should finish persisted transactions first

Can run in parallel with:

- Agent 4 once DB shape is stable

Should avoid touching:

- import parser internals unless necessary
- dashboard/report calculations

## Agent 4: Recurring Entries

Ownership:

- `src/features/recurring/**`
- `src/app/recurring/**`
- related UI components

Responsibilities:

- recurring expense and income models
- effective-date versioning
- create/edit recurring rules
- generate manual entries for reporting periods

Deliverables:

- recurring rent and salary can be created
- recurring changes do not rewrite past periods
- recurring-generated manual entries feed reporting inputs

Dependencies:

- Agent 1 should finish DB foundation first

Can run in parallel with:

- Agent 3
- Agent 6

Should avoid touching:

- parser code
- dashboard aggregation logic beyond the recurring data contract

## Agent 5: Reporting and Dashboard

Ownership:

- `src/features/reporting/**`
- `src/app/page.tsx`
- `src/app/reports/**`
- `src/features/home/**`
- `src/components/app-shell/**`
- related report/home-shell components

Responsibilities:

- build period summary services
- monthly summary
- yearly summary
- trailing 12-month averages
- top-level reporting teasers and home-shell summary cues

Deliverables:

- report pages and the shared home hub are backed by real data
- household can see income, spending, savings, and trends

Dependencies:

- Agent 2 for imported transactions
- Agent 4 for recurring/manual entries

Can run in parallel with:

- late-stage Agent 3 work

Should avoid touching:

- import parser code
- auth/bootstrap concerns

## Agent 6: Investment Import Foundation

Ownership:

- `src/features/investments/**`
- `src/app/investments/**` if created
- investment import route pieces only if clearly isolated

Responsibilities:

- maintain the Excellence investment import track
- extend saved snapshot work into user-visible holdings views
- maintain holdings snapshot persistence
- keep investment work isolated from expense MVP flows

Deliverables:

- preview `examples/investment/person 1/izzy 2.2.26.xlsx`
- preview `examples/investment/person 2/לי השקעות.xlsx`
- save parsed holdings snapshots into the existing investment schema
- render the latest active saved holdings per investment account on `/investments`

Dependencies:

- preview foundation is now in place

Can run in parallel with:

- everyone except when shared schema changes are needed

Should avoid touching:

- expense import files
- dashboard/report files used by expense MVP

## Concrete task backlog

## Phase 1: Foundation and persistence

### Task P1.1

Owner:

- Agent 1

Status:

- done

Task:

- generate and commit first DB migrations from current schema

Definition of done:

- migrations exist and apply cleanly
- completed with a regenerated baseline migration under `src/db/migrations/**`

### Task P1.2

Owner:

- Agent 1

Status:

- done

Task:

- add workspace setup and base currency storage

Definition of done:

- workspace can be created or seeded
- base currency is readable by import flows
- completed with a seeded dev current-workspace helper

### Task P1.3

Owner:

- Agent 2

Status:

- done

Task:

- persist import preview metadata and raw import rows

Definition of done:

- previewed file can be saved as an import record
- completed through `POST /api/imports` plus `import_rows` persistence

### Task P1.4

Owner:

- Agent 2

Status:

- done

Task:

- normalize saved imports into `transactions`

Definition of done:

- confirmed imports create real transaction rows
- completed with financial-account resolution and transaction writes

## Phase 2: Expense usability

### Task P2.1

Owner:

- Agent 3

Status:

- done

Task:

- create transaction list page

Definition of done:

- user can inspect normalized transactions and current classification state

### Task P2.2

Owner:

- Agent 3

Status:

- done

Task:

- create review queue with bulk classification

Definition of done:

- user can process uncertain rows efficiently and save reusable merchant rules

### Task P2.3

Owner:

- Agent 4

Status:

- done

Task:

- build recurring entry CRUD and versioning

Definition of done:

- recurring rent and salary can be managed

### Task P2.4

Owner:

- Agent 4

Status:

- done

Task:

- generate manual entries from recurring rules

Definition of done:

- recurring items appear in reporting inputs

## Phase 3: Reporting MVP

### Task P3.1

Owner:

- Agent 5

Status:

- done

Task:

- implement monthly reporting from classified imported transactions and manual entries

Definition of done:

- user can view a real monthly report with income, expense, savings, category, and member breakdowns

### Task P3.2

Owner:

- Agent 5

Status:

- done

Task:

- extend reporting into yearly averages, rolling periods, and dashboard cards

Definition of done:

- reporting is useful beyond a single month view

### Task P3.3

Owner:

- Agent 5

Status:

- done

Task:

- introduce `expense_events` and `expense_allocations` for adjusted-period reporting

Definition of done:

- payment-month and adjusted-month reporting can coexist without rewriting inputs
- review flow can edit transaction allocations with equal and manual month splits

### Task P3.4

Owner:

- Agent 3

Status:

- done

Task:

- build the first shared-settlement workflow on top of classified and allocated expense data

Definition of done:

- shared expenses can be selected, split, and tracked toward settlement
- workspace can reach settlement readiness with exactly 2 active members in app settings

### Task P3.5

Owner:

- Agent 4

Status:

- done

Task:

- add one-time manual entry CRUD

Definition of done:

- non-recurring income and expense entries can be added and edited without using recurring rules

### Task P3.6

Owner:

- Agent 3

Status:

- done

Task:

- extend allocation editing beyond transaction review into `/expenses` and one-time manual entry flows

Definition of done:

- allocations can be inspected and edited from the broader expense workspace, not only from the review queue

### Task P3.7

Owner:

- Agent 4

Status:

- done

Task:

- extend one-time manual entries so manual shared expenses participate in the pairwise shared-settlement flow

Definition of done:

- a one-time manual shared expense can be created and edited from `/expenses`
- manual shared expenses become eligible for split setup in `/settlements`
- equal, percentage, and fixed split rules work for manual shared expenses
- settlement balances stay synced when a manual shared expense is edited, reclassified, or deleted
- imported shared-expense flows and reporting continue to work without regression

## Phase 4: Investment foundation

### Task P4.1

Owner:

- Agent 6

Status:

- done

Task:

- inspect and document the Excellence file structure

Definition of done:

- provider mapping is written and parser contract is clear

### Task P4.2

Owner:

- Agent 6

Status:

- done

Task:

- build investment preview parser for Excellence

Definition of done:

- holdings/activity preview works in code

### Task P4.3

Owner:

- Agent 6

Status:

- done

Task:

- persist Excellence investment previews into the existing investment import tables

Definition of done:

- a previewed Excellence workbook can be confirmed and saved as an `investment` import
- save flow creates or resolves an `investment_accounts` row for the workspace context
- parsed holdings are stored in `holding_snapshots`
- current sample previews still work after persistence is introduced
- activity persistence stays out of scope until a real activity export sample exists

### Task P4.4

Owner:

- Agent 6

Status:

- done

Task:

- build persisted holdings views on top of saved `holding_snapshots`

Definition of done:

- `/investments` shows active saved holdings, not only import history
- latest snapshot data can be inspected per investment account
- replaced imports remain visible in history while superseded holdings do not appear as active positions
- activity persistence stays out of scope until a real activity export sample exists

## Parallelization rules

- Agent 1 should finish first or near-first because DB and workspace setup unblock others.
- Agent 2 should start immediately after Agent 1 stabilizes migrations and workspace currency access.
- Agent 3 and Agent 4 can work in parallel after Agent 2 begins producing real transactions.
- Agent 5 can now support settlement/reporting gaps on top of the stable adjusted-period contract.
- Agent 6 can start at any time if it keeps to investment-only files.

## Merge safety rules

- each agent should own a mostly disjoint file set
- shared schema changes should be coordinated before merge
- do not refactor another agent’s area unless required
- do not rename shared contracts without updating the task board

## Best next assignments right now

Now that the workflow shell and home hub are merged, I recommend:

1. Agent 1
   Support platform-level polish only if dogfooding uncovers shell, settings, or DB-state issues

2. Agent 2
   Own import-list and import-history follow-ups surfaced by real-file testing

3. Agent 3
   Own review-queue and `/expenses` usability fixes surfaced by dogfooding, especially progress cues and ledger ergonomics

4. Agent 4
   Return only if recurring/manual interactions surface during the expense-workflow pass

5. Agent 5
   Own the home-hub follow-ups and any reporting cues that need to better reflect workflow state

6. Agent 6
   Keep investment composition follow-ups secondary until the expense workflow feels stable

That keeps the main expense MVP stable, uses the new shell for real user testing, and prioritizes locally testable product work before hosted-deployment hardening and later auth planning.

## Handoff note for the next agent

The home shell and hybrid `/` hub are now complete. The next agent should stay tightly scoped to dogfooding and workflow-usability fixes across the expense path before broadening the investment sidecar again.

Practical note:

- the root route and shared shell are DB-backed, so local PostgreSQL must be running during testing or the app will fail early before route-specific debugging is possible

Preferred write scope:

- `src/app/page.tsx`
- `src/components/app-shell/**`
- `src/app/imports/**`
- `src/app/imports/review/**`
- `src/app/expenses/**`
- `src/features/home/**`
- `src/features/expenses/**` only when usability gaps require query or presentation support

Key constraint:

- do not reopen import persistence, shared-settlement schema, or investment persistence unless dogfooding proves there is a concrete product blocker
