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

Not built yet:

- auth
- transaction review flow
- transaction list page
- recurring entries UI and logic
- real reports backed by DB data
- investment parser implementation

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

Deliverables:

- user can review uncertain transactions
- user can classify personal/shared/household/income
- user can save merchant rules

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
- one-off manual income/expense entries are supported

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
- `src/app/dashboard/**`
- `src/app/reports/**`
- related dashboard/report components

Responsibilities:

- build period summary services
- monthly summary
- yearly summary
- trailing 12-month averages
- top-level dashboard cards

Deliverables:

- report pages are backed by real data
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

- inspect `excellence` sample format
- define normalized holdings/activity models
- build investment preview parser
- prepare simple allocation data shape

Deliverables:

- parse `examples/investment/person 1/izzy 2.2.26.xlsx`
- produce holdings/activity preview for Excellence

Dependencies:

- none for preview-only work

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

- next

Task:

- create transaction list page

Definition of done:

- user can filter and inspect normalized transactions

### Task P2.2

Owner:

- Agent 3

Status:

- next

Task:

- create review queue with bulk classification

Definition of done:

- user can process uncertain rows efficiently

### Task P2.3

Owner:

- Agent 4

Status:

- ready after review contracts are defined

Task:

- build recurring entry CRUD and versioning

Definition of done:

- recurring rent and salary can be managed

### Task P2.4

Owner:

- Agent 4

Status:

- blocked by P2.3

Task:

- generate manual entries from recurring rules

Definition of done:

- recurring items appear in reporting inputs

## Phase 3: Reporting MVP

### Task P3.1

Owner:

- Agent 5

Status:

- blocked by classification and recurring inputs

Task:

- implement expense event and allocation generation from imported transactions

Definition of done:

- transactions map into reporting records

### Task P3.2

Owner:

- Agent 5

Status:

- blocked by P3.1

Task:

- implement period summary calculation

Definition of done:

- monthly and yearly summaries can be computed

### Task P3.3

Owner:

- Agent 5

Status:

- blocked by P3.1 and P3.2

Task:

- build dashboard and reports pages on top of real summaries

Definition of done:

- dashboard shows spend/income/savings cards and trend slices

## Phase 4: Investment foundation

### Task P4.1

Owner:

- Agent 6

Status:

- optional sidecar

Task:

- inspect and document the Excellence file structure

Definition of done:

- provider mapping is written and parser contract is clear

### Task P4.2

Owner:

- Agent 6

Status:

- optional sidecar after P4.1

Task:

- build investment preview parser for Excellence

Definition of done:

- holdings/activity preview works in code

## Parallelization rules

- Agent 1 should finish first or near-first because DB and workspace setup unblock others.
- Agent 2 should start immediately after Agent 1 stabilizes migrations and workspace currency access.
- Agent 3 and Agent 4 can work in parallel after Agent 2 begins producing real transactions.
- Agent 5 should start once imported transactions and recurring entries have stable contracts.
- Agent 6 can start at any time if it keeps to investment-only files.

## Merge safety rules

- each agent should own a mostly disjoint file set
- shared schema changes should be coordinated before merge
- do not refactor another agent’s area unless required
- do not rename shared contracts without updating the task board

## Best next assignments right now

Now that foundation and import persistence are in place, I recommend:

1. Agent 1
   Tighten workspace settings so the seeded base currency and member model are visible and editable in the app

2. Agent 2
   Stop here on core imports unless review work uncovers a missing persistence field

3. Agent 3
   Build the transaction list page and the first review queue using persisted `transactions`

4. Agent 4
   Start recurring entry CRUD in parallel once Agent 3 locks the classification data contract

5. Agent 6
   Optional: start the isolated Excellence holdings-preview sidecar without touching shared import routes or schema

That keeps the main expense MVP moving toward review, recurring inputs, and reporting.
