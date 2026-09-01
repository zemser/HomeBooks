# Focused Budgeting Experience Specification

## Status

- status: proposed
- audience: product, design, and engineering
- scope: expense import, review, monthly reporting, yearly reporting, and primary navigation
- reference workflow: `Budget Lee & Izzy.xlsx`

## Decision summary

The app's primary job is to help a person, couple, or household complete a repeatable monthly budgeting loop:

1. import bank and credit-card statements
2. review and classify the imported transactions
3. add any missing manual or recurring items
4. understand income, spending, and savings for the month
5. compare the month with the rest of the year

A workspace with one active member is complete and fully supported. Adding another member is optional. Couple-specific features, especially personal-member comparisons and settlements, become more useful when two or more members exist, but they must not block setup or reporting.

The first implementation priority is trustworthy reporting. A report must make incompleteness obvious and must summarize spending using the same primary buckets as the reference workbook:

- personal spending for each member
- shared spending
- household spending
- total spending
- income
- savings

## Problem statement

The current application has most of the required financial mechanics, but the experience is organized around implementation concepts rather than the user's monthly job.

Current primary destinations include separate pages for imports, review, expenses, recurring entries, and reports. The current report shows income, expenses, savings, categories, and a member-or-payer breakdown, but it does not provide a first-class personal/shared/household summary. It can also show precise partial totals while transactions still need review.

As a result, users can complete individual actions without feeling confident that they have completed a month or reproduced the overview they previously maintained in the spreadsheet.

## Product goal

Make the answer to these questions obvious for any selected month:

- Is this month's data complete enough to trust?
- How much income was received?
- How much was spent in total?
- How much was saved?
- How much was personal spending for each member?
- How much was shared spending?
- How much was household spending?
- Which categories and transactions explain each amount?

For a selected year, make the same figures comparable month by month and provide useful monthly averages.

## Non-goals

This specification does not require:

- bank API connections or automatic bank syncing
- paid AI classification
- automated financial advice
- retirement projections
- advanced investment analytics
- a redesign of authentication, RLS, backups, or import storage
- removal of payment-date or adjusted-period reporting
- removal of settlements or investments

Those capabilities may remain, but they must not dominate the primary budgeting experience.

## Supported workspace shapes

### One active member

- setup is complete
- the member receives one personal-spending bucket
- shared and household classifications remain available
- reports render normally
- settlements show an explanatory empty state because balancing requires at least two active members
- adding another member is an optional settings action, not a blocking task

### Two active members

- each member receives a personal-spending bucket
- shared and household buckets remain separate
- payer and settlement features are available
- reports compare the two personal buckets without assuming fixed names or genders

### More than two active members

- each active member receives a personal-spending bucket
- historical reports continue to show inactive members referenced by historical transactions
- layouts may collapse additional personal buckets into a scrollable or stacked region
- calculations must not assume exactly two members

## Financial vocabulary

The interface and implementation must keep these concepts distinct.

### Spending scope

Who or what benefited from the expense:

- `personal`: belongs to one workspace member
- `shared`: a discretionary or general cost shared by members
- `household`: a household operating cost such as rent, utilities, groceries, or home supplies

The persisted `classification_type` remains the source for this concept in the first reporting implementation.

### Personal owner

The member whose personal spending includes the expense. Required when spending scope is `personal`.

The existing `transaction_classifications.member_owner_id` may continue to supply this value in the first reporting implementation.

### Payer

The member whose account or payment method paid the expense. Payer is relevant to settlements and is conceptually independent of spending scope.

Examples:

- Lee pays for Izzy's personal purchase: personal owner is Izzy; payer is Lee.
- Izzy pays the electricity bill: scope is household; payer is Izzy.
- Lee pays for a shared dinner: scope is shared; payer is Lee.

The existing model partially overloads member ownership and payer semantics. Separating them is a later phase in this specification and is not required to ship the first trustworthy report.

### Category

What the money was spent on, such as groceries, rent, dining, transport, health, or shopping. Category is independent of spending scope and payer.

### Reporting period

- payment-date mode: use the source event's payment or event date
- adjusted-period mode: use saved allocations to distribute the event across report months

Payment-date mode remains the default. Adjusted-period mode is retained as an advanced control.

### Savings

For a report period:

`savings = reportable income - reportable expenses`

Transfers and ignored transactions do not contribute to income, expenses, or savings.

## Core user journeys

### Journey A: first use

1. The user creates or enters a workspace.
2. The workspace has at least the current user as an active member.
3. Setup is considered complete.
4. The user may optionally add more members.
5. The primary action becomes importing the first statement.

Acceptance criteria:

- a one-member workspace never displays an incomplete-setup error solely because there is only one member
- settings clearly offers `Add member`
- settlements explain that at least two active members are needed, without treating this as a workspace error

### Journey B: monthly import

1. The user selects or confirms the working month.
2. The user uploads one or more supported CSV/XLSX statements.
3. Each import is previewed before saving.
4. Saved imports show their transaction-date range; an import is not assumed to equal one calendar month.
5. Duplicate files remain blocked by the existing checksum behavior.
6. The user is taken to the review state for the affected transactions.

Acceptance criteria:

- multiple imports may contribute transactions to the same month
- a single import may contribute transactions to multiple months
- the post-save action says how many transactions were imported, classified automatically, and left for review
- the post-save primary CTA is `Review transactions`

### Journey C: review and classification

For each transaction, the user answers in this order:

1. How should this transaction be treated?
   - Personal
   - Shared
   - Household
   - Income
   - Transfer
   - Ignore
2. What category does it belong to, when reportable?
3. Which member owns it, when personal?
4. Who paid or received it, when supported by the current model?
5. Should the decision be reused for matching merchants?

Acceptance criteria:

- personal requires a member owner
- shared and household do not require a personal owner
- category is available for personal, shared, household, and income
- transfer and ignore are considered reviewed but excluded from financial totals
- save-and-next remains the primary action
- bulk review and merchant-rule behavior remain available
- the user can always see remaining count and completion percentage
- technical allocation controls remain in a collapsed advanced section

### Journey D: finish the month

The application determines a visible month status:

- `empty`: no imported, manual, or recurring events exist for the month
- `in_progress`: one or more imported transactions dated in the month have no saved classification
- `complete`: every imported transaction dated in the month has a saved classification, including transfer or ignore

The status is descriptive, not a locking mechanism. Partial reports remain viewable.

Acceptance criteria:

- Home and Reports show the same month status
- an in-progress month displays reviewed and total transaction counts
- partial totals are explicitly labeled `Based on reviewed transactions`
- a complete month displays a positive completion state and a CTA to inspect the report
- manual and recurring entries do not require review unless they are invalid or incomplete at creation time

### Journey E: understand a month

The default report opens the latest month containing financial activity, unless the user explicitly selected another month.

The monthly report must show, in this order:

1. month and completion status
2. Income, Total spent, and Saved
3. Personal spending for each relevant member, Shared, and Household
4. category-by-scope breakdown
5. transaction drill-down
6. advanced reporting and FX details

Acceptance criteria:

- the first viewport contains completion status and the primary financial totals on desktop
- all monetary expense cards display positive magnitudes; savings may be positive or negative
- the sum of the personal, shared, and household expense buckets reconciles to Total spent
- selecting a scope or category filters or reveals the contributing transactions
- uncategorized reportable items appear as `Uncategorized`
- imported, one-time manual, and recurring-generated items use the same aggregation rules

### Journey F: understand a year

The yearly report provides one row per month and reflects the structure of the reference workbook.

Required columns:

- month
- income
- personal spending for each relevant member
- shared spending
- household spending
- total spending
- savings

Required summary values:

- total income
- total spending
- total savings
- average monthly income
- average monthly spending
- average monthly savings
- average monthly personal/shared/household spending

Acceptance criteria:

- selecting a month opens that month's report
- months with no data remain distinguishable from complete zero-spend months
- each month carries its completion status
- annual totals reconcile to the displayed monthly rows
- dynamic member columns work for one, two, or more members

## Information architecture

### Primary navigation

Desktop and mobile primary navigation should contain:

1. Home
2. Transactions
3. Reports
4. More

`More` contains:

- Recurring
- Settlements
- Investments, labeled Beta while applicable
- Settings

On desktop, `More` may remain an expanded secondary section in the sidebar. On mobile, it must be a single destination or menu rather than three header pills.

### Transactions area

Add `/transactions` as the workflow entry point with these tabs or clearly connected states:

- Import
- Review, with the pending-count badge
- All transactions

Implementation may initially reuse the existing `/imports`, `/imports/review`, and `/expenses` pages. Existing URLs remain valid during migration. Navigation and cross-links should use `/transactions` once the shell exists.

### Reports area

The Reports page has a top-level view switch:

- Month
- Year

Optional secondary views:

- Rolling 12 months
- adjusted-period mode
- FX details

These secondary views must not push the selected month's category explanation below a full year of tables.

## Home specification

### Header

- workspace name
- selected month control
- optional settings link

### Month status card

Shows:

- status: Empty, In progress, or Complete
- reviewed count and total count
- the single recommended next action

Next-action priority:

1. no imports or manual activity: `Import transactions`
2. pending review: `Review N transactions`
3. complete month: `View monthly report`

Adding a second member is never inserted into this blocking priority chain.

### Monthly snapshot

When data exists, show:

- Income
- Total spent
- Saved
- one personal-spending card per relevant member
- Shared
- Household

When the month is in progress, every amount group includes the partial-data warning.

### Supporting content

- top three spending categories
- recent imports affecting the selected month
- optional link to recurring entries when the month appears to be missing expected items

## Monthly report specification

### Completeness banner

Example in-progress copy:

> April is in progress. 41 of 52 imported transactions are reviewed. Totals below are based on reviewed transactions and will change.

Example complete copy:

> April is complete. All 52 imported transactions have been reviewed.

### Primary totals

- Income
- Total spent
- Saved

### Spending-scope totals

Return and display a dynamic collection rather than hardcoded partner names:

```ts
type SpendingScopeSummary = {
  key: string;
  scope: "personal" | "shared" | "household";
  memberId: string | null;
  label: string;
  expenseTotal: number;
  itemCount: number;
};
```

Expected rows for a two-member workspace might be:

- Personal · Lee
- Personal · Izzy
- Shared
- Household

### Category-by-scope breakdown

The report must provide a matrix that explains both dimensions at once:

| Category | Personal · Member A | Personal · Member B | Shared | Household | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Groceries | 0 | 0 | 0 | 1,800 | 1,800 |
| Dining | 240 | 180 | 450 | 0 | 870 |

For more than two members, the table may scroll horizontally on desktop and use stacked category cards on mobile.

Suggested return type:

```ts
type CategoryScopeAmount = {
  scope: "personal" | "shared" | "household";
  memberId: string | null;
  amount: number;
  itemCount: number;
};

type MonthlyCategoryScopeBreakdownItem = {
  categoryId: string | null;
  category: string;
  amounts: CategoryScopeAmount[];
  expenseTotal: number;
  itemCount: number;
};
```

### Income attribution

Income remains outside the expense-scope reconciliation. The report may show income by receiving member when a member is assigned.

```ts
type MemberIncomeSummary = {
  memberId: string | null;
  memberName: string;
  incomeTotal: number;
  itemCount: number;
};
```

### Transaction drill-down

Selecting any total or matrix cell reveals contributing items with:

- date or report month
- merchant/title
- amount
- category
- spending scope
- personal owner, if applicable
- payer, when available
- source type
- import source in secondary details
- FX details in secondary details

The default table should not show original, settlement, and normalized amounts as three always-visible columns when they are equal.

## Year report specification

Suggested return type:

```ts
type YearMonthSummary = {
  month: string;
  status: "empty" | "in_progress" | "complete";
  reviewedTransactionCount: number;
  totalTransactionCount: number;
  incomeTotal: number;
  expenseTotal: number;
  savingsTotal: number;
  scopes: SpendingScopeSummary[];
};

type YearReportData = {
  year: number;
  workspaceCurrency: string;
  months: YearMonthSummary[];
  totals: {
    incomeTotal: number;
    expenseTotal: number;
    savingsTotal: number;
    scopes: SpendingScopeSummary[];
  };
  averages: {
    monthlyIncome: number;
    monthlyExpense: number;
    monthlySavings: number;
    scopes: SpendingScopeSummary[];
  };
};
```

Average denominator rules:

- a selected calendar year through the current month uses elapsed months from January through the selected/current month
- a completed past year uses 12 months
- an explicitly selected custom range uses the number of calendar months in the range
- empty months inside the selected range count as zero and remain visible

## Report completeness data contract

Add a shared completeness type used by Home and Reports:

```ts
type MonthCompleteness = {
  month: string;
  status: "empty" | "in_progress" | "complete";
  importedTransactionCount: number;
  reviewedTransactionCount: number;
  pendingTransactionCount: number;
  reportableTransactionCount: number;
  excludedTransactionCount: number;
  manualEntryCount: number;
};
```

Definitions:

- imported transaction: normalized transaction whose `transaction_date` is in the selected calendar month
- reviewed: has a persisted classification of any type
- pending: has no persisted classification
- reportable: classification is personal, shared, household, or income
- excluded: classification is transfer or ignore
- status is `empty` when imported count and manual/recurring activity are both zero
- status is `in_progress` when pending count is greater than zero
- otherwise status is `complete`

Completeness is based on source transaction month, even when the report is viewed in adjusted-period mode. Adjusted-period copy must make that distinction clear.

## Aggregation rules

All new report aggregations must:

- include classified imported transactions, one-time manual entries, and recurring-generated entries
- exclude transfer and ignore
- use normalized workspace-currency amounts
- use payment-date or allocation rows according to the selected reporting mode
- treat expense amounts as positive display magnitudes
- keep income separate from expense scope totals
- include inactive historical members when referenced by historical records
- group missing categories under `Uncategorized`
- perform decimal-safe arithmetic using existing money utilities

Required reconciliation checks:

```text
personal totals across members + shared + household = total expenses
income - total expenses = savings
category row totals = sum of category scope cells
sum of category totals = total expenses
sum of year month totals = year totals
```

## Payer-model follow-up

The trustworthy report can ship using the existing classification model. A later migration should stop overloading member ownership and payer.

Target logical fields:

- `personal_owner_member_id`: required only for personal expenses
- `paid_by_member_id`: optional for any expense and normally derived from the financial-account owner
- `received_by_member_id`: optional for income

Migration requirements:

- preserve `transaction_classifications.member_owner_id` until all reads and writes migrate
- for existing personal classifications, backfill personal owner from `member_owner_id`
- for existing shared classifications, treat `member_owner_id` as payer where that matches existing behavior
- for imported transactions, use `financial_accounts.owner_member_id` as the default payer when present
- do not fabricate a payer when the source account has no owner
- permit household expenses to have a payer
- keep settlement calculations limited to intentionally tracked split expenses

This migration must be delivered separately from the initial reporting work to reduce risk.

## Export contract

Export is not required for the first release of this spec, but reporting output must be shaped so export does not require new calculations.

### Yearly summary CSV

One row per month with dynamic personal-member columns:

```text
month,status,income,personal_<member_a>,personal_<member_b>,shared,household,total_spent,savings
```

For a one-member workspace, only one personal-member column is emitted. Member-derived column headers use stable member IDs in machine-readable keys and display names in a separate header/metadata row when the format supports it.

### Category detail CSV

One row per month and category:

```text
month,category,personal_<member_a>,personal_<member_b>,shared,household,total_spent,item_count
```

### Excel workbook

A later Excel export may package both tables as:

- `Year Summary`
- `Category Detail`
- optional `Transactions`

The export must reuse the same report service results used by the UI and must pass the same reconciliation tests.

## Responsive and accessibility requirements

- mobile primary navigation contains no more than four destinations
- the mobile Home first viewport shows month status and the next action
- financial cards do not require horizontal scrolling
- category-scope matrices use a mobile-specific stacked presentation when necessary
- all report filters have visible labels
- all status meaning is conveyed with text, not color alone
- report tables retain semantic headers
- keyboard review behavior and focus visibility remain intact
- sticky actions must not obscure the classification fields or the currently focused control

## Implementation plan

### Phase 1: report trust and completeness

Deliverables:

- `MonthCompleteness` query/service
- completeness on Home and Reports
- partial-report warning
- complete-month confirmation
- focused tests for empty, in-progress, and complete months

Likely code areas:

- `src/features/reporting/monthly-report.ts`
- `src/features/home/service.ts`
- `src/features/home/types.ts`
- `src/app/(app)/page.tsx`
- `src/app/(app)/reports/page.tsx`

Exit criteria:

- a report can no longer appear complete while pending transactions exist without an explicit warning
- Home and Reports agree on counts and status

### Phase 2: spending-scope reporting

Deliverables:

- `SpendingScopeSummary`
- `MonthlyCategoryScopeBreakdownItem`
- `MemberIncomeSummary`
- monthly scope cards
- category-by-scope matrix
- reconciliation unit tests

Likely code areas:

- `src/features/reporting/monthly-report.ts`
- `src/features/reporting/presentation.ts`
- report components extracted from `src/app/(app)/reports/page.tsx`

Exit criteria:

- a one-member report shows one personal bucket plus shared and household
- a two-member report reproduces the reference workbook's personal-member/shared/household structure
- scope totals, category totals, total expenses, and savings reconcile

### Phase 3: focused Home and Reports

Deliverables:

- selected-month Home experience
- monthly snapshot with scope totals
- Month/Year report switch
- monthly category detail moved above historical comparisons
- payment-date/adjusted-period and FX controls moved to Advanced
- yearly month-by-month scope table

Exit criteria:

- users can understand the selected month without scrolling through yearly tables
- users can reach the category explanation from the first report section
- yearly rows reproduce the monthly totals exactly

### Phase 4: Transactions information architecture

Deliverables:

- `/transactions` workflow entry point
- Import, Review, and All transactions states
- simplified primary navigation
- mobile `More` destination
- old route compatibility

Exit criteria:

- the primary navigation has Home, Transactions, Reports, and More
- the pending-review badge appears on Transactions or its Review state
- import save flows directly into review
- existing deep links continue to work

### Phase 5: payer separation

Deliverables:

- schema migration for personal owner, payer, and income recipient semantics
- account-owner payer defaults
- household payer support
- updated settlement integration
- backward-compatible data migration tests

Exit criteria:

- personal owner and payer can differ
- household expenses can record who paid
- existing classifications and settlements retain their meaning after migration

### Phase 6: export

Deliverables:

- yearly summary CSV
- category detail CSV
- optional Excel workbook after CSV validation

Exit criteria:

- exported totals reconcile with the same selected UI report
- one-, two-, and multi-member column shapes are covered by tests
- Hebrew category and member names round-trip correctly in UTF-8 CSV and Excel

## Test plan

### Unit tests

- completeness status for no data, pending rows, transfer/ignore rows, and fully reviewed rows
- scope aggregation for one, two, and three members
- personal classification without owner is rejected
- shared and household totals do not appear in a member's personal bucket
- income is excluded from expense-scope totals
- payment-date and adjusted-period totals reconcile independently
- inactive historical member remains in historical reports
- category and year reconciliations

### Integration tests

- imported, manual, and recurring sources produce identical report shapes
- rules that classify on import update completeness immediately
- undoing a classification moves a month back to in-progress
- editing a classification updates scope and category totals
- changing an allocation updates adjusted-period reports without changing payment-date completeness

### End-to-end scenarios

1. One-member workspace
   - import a statement
   - classify personal, shared, household, transfer, and ignore rows
   - finish the month
   - verify personal/shared/household totals and savings

2. Two-member workspace
   - classify personal expenses for different members
   - classify shared and household expenses
   - verify separate personal buckets and shared/household totals

3. Partial month
   - leave at least one imported transaction unreviewed
   - verify Home and Reports show the same warning and counts
   - verify partial totals remain visible and labeled

4. Year report
   - create activity across several months
   - verify monthly drill-down and year reconciliation

5. Responsive navigation
   - verify four primary mobile destinations
   - verify scope summaries are readable at the supported mobile viewport

## Definition of done

The focused budgeting experience is complete when:

- a one-member workspace is fully valid
- the primary workflow is import, review, understand month, and compare year
- incomplete reports cannot be mistaken for complete reports
- monthly reporting shows personal spending per member, shared, household, total spending, income, and savings
- category detail explains each spending-scope total
- yearly reporting shows the same dimensions month by month
- primary navigation no longer treats Imports, Review, and Expenses as unrelated top-level products
- desktop and mobile experiences prioritize the same monthly job
- existing recurring, allocation, settlement, investment, FX, auth, and RLS behavior is preserved unless explicitly changed by a phase above
