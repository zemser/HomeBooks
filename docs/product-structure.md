# Finance App Product Structure

## Product Goal

Build a low-cost personal finance app for couples or family members to:

- understand spending, income, and savings over time
- track who paid for shared expenses and who owes whom
- see investment allocation and portfolio changes in one place
- combine daily money tracking with long-term wealth visibility

The app should be designed for a small number of early users and should avoid paid infrastructure or paid third-party tools in the first iterations.

## Product Summary

This app is a shared household finance workspace.

Each workspace belongs to one couple or family unit and has multiple members.
Users upload tabular exports from banks and investment providers, mainly CSV and Excel files, and the app normalizes the files into one common format.
From that normalized data, the app creates monthly summaries, shared-expense views, and investment dashboards.

The first release should focus on expense and income tracking, while keeping the data model flexible enough to add shared-expense settlement and investment analysis without reworking the system.

## Core Problems To Solve

### 1. Expense and income visibility

Users want to know:

- yearly averages and trends, not only one-month snapshots
- how much each person spent on themselves
- how much they spent together
- how much they spent on the household
- how much income each person received
- how much the household saved each month

### 2. Shared expense balancing

Users want to know:

- who paid for a shared expense
- how much of that expense should be split
- who currently owes money to whom

This should work like a lightweight Splitwise-style flow, but should reuse imported expense data whenever possible.

### 3. Investment visibility

Users want to know:

- how much money they currently have in investments
- how that money is distributed across cash, indexes, stocks, and funds
- gains and losses over time
- optionally, their buy and sell history

### 4. Combined planning insight

Once expenses, savings, and investments are in one place, the app can later provide planning insights such as:

- average monthly savings
- savings trends
- rough time-to-goal or time-to-retirement estimates

## Product Principles

### Low-cost first

- no paid AI services
- no paid OCR dependency
- no expensive external financial data providers
- rely on CSV import, user review, and deterministic parsing

### Import once, reuse everywhere

Imported financial data should become the foundation for summaries, shared-expense tracking, and future planning tools.

### Flexible input formats

Different banks and investment providers export different CSV templates, so the app must normalize all imports into internal standard models.

### Human review over automation magic

For early versions, it is better to let users confirm mappings and categories than to build fragile “smart” automation.

### Privacy and trust

Financial data is sensitive, so the app should minimize external dependencies and keep the system understandable.

## MVP Scope

## Feature 1: Expense Management

This is the most important feature and should be the first full workflow.

### User inputs

- bank CSV uploads
- bank Excel uploads
- optional manual CSV uploads for custom household tracking
- optional manual corrections after import

### MVP capabilities

- upload CSV and Excel files from different banks
- support multiple tabular import formats through configurable import templates
- map imported rows into a normalized transaction model
- let the user review unmatched or ambiguous columns during import
- combine multiple statement files into one monthly view
- support bank periods that do not match calendar months
- support foreign-currency expenses and normalize them to the workspace main currency
- classify transactions into:
  - personal spending for member A
  - personal spending for member B
  - shared couple spending
  - household spending
  - income
  - transfer or ignored transaction
- produce a monthly summary that shows:
  - total income
  - total spending
  - total savings
  - spending by member
  - shared and household spending
- produce period summaries that can also show:
  - yearly averages
  - trailing 12-month averages
  - category trends

### Important product note

Many banks generate statements from around the 10th of one month to the 10th of the next.
Because of that, the app should not assume a single uploaded file equals one calendar month.

Instead, the system should support:

- multiple uploads contributing to one summary month
- filtering transactions by actual transaction date
- generating a summary for a user-defined month range

### Main reporting principle

Even though the UI will show monthly summaries, the more important insight is cross-month behavior.

So the reporting layer should be designed around flexible periods such as:

- one month
- one quarter
- one year
- rolling 12 months

This will let the product answer questions like:

- average monthly savings this year
- average household spend over the last 12 months
- year-over-year spending growth
- whether a specific month was unusual or normal

### Important expense-management edge cases

These cases should be supported in the core design and not treated as exceptions.

#### A. Shared expenses cannot always be inferred from the CSV alone

A raw bank transaction usually tells us:

- date
- merchant or description
- amount
- account owner

It usually does not tell us:

- whether the expense was personal or shared
- whether it belongs to the household
- how it should be split

So the system should not depend on fully automatic classification.

Recommended MVP approach:

- import the transaction automatically
- suggest a likely category based on merchant rules and past user decisions
- let the user confirm or change only the uncertain items
- allow the user to save reusable rules such as:
  - supermarket usually means household
  - specific restaurant usually means shared
  - gym membership belongs to member A
- remember previous decisions for the same merchant or pattern

This keeps the review flow practical without requiring expensive AI or forcing the user to classify every row from scratch every month.

#### B. Some expenses belong to a different month than the payment date

Examples:

- electricity
- water
- municipal taxes
- internet or phone bills

The money may leave the bank account in August, but the expense may belong partly or fully to May and June.

To support this, the system should distinguish between:

- payment date: when money left the account
- coverage period: which period the expense actually belongs to
- reporting month: the month summary where the expense should appear

Recommended MVP approach:

- default to payment-date accounting for normal expenses
- allow selected transactions to be marked as “period-based”
- let the user assign:
  - one month
  - multiple months
  - a date range
- distribute the amount across the selected months, either equally or manually

This means monthly summaries should be able to show two views in the future:

- cash view: based on actual payment dates
- accrual view: based on the period the expense belongs to

For the first version, the app can compute the main household summary using the adjusted reporting month while still storing the original payment date.

#### C. Some recurring expenses may not appear in bank CSV imports in a usable way

Examples:

- rent paid via checks
- manually settled family payments
- cash expenses
- regular payments from non-imported accounts

The app should support manual recurring entries in addition to imported transactions.

Recommended MVP approach:

- support manual recurring expense rules
- allow users to define:
  - title
  - amount
  - owner or payer
  - expense type
  - shared or personal status
  - recurrence pattern
  - coverage month or date
- generated entries should appear together with imported transactions in the monthly summary
- manual entries must be clearly marked so users know they were not bank-imported

#### E. Foreign-currency transactions should be normalized into one main currency

The workspace should define one main currency for reporting, for example:

- ILS
- USD
- EUR

Imported transactions may contain:

- local-currency charges
- foreign-currency charges
- statement sections grouped by settlement currency

Recommended MVP approach:

- store both original amount and original currency when available
- store the reporting currency amount separately
- convert to the workspace main currency using a historical monthly average FX rate
- keep the conversion method transparent so users can understand how the number was calculated

Example:

- a 20 USD expense in June
- workspace main currency is ILS
- app uses the average USD/ILS rate for June
- the normalized reporting amount is stored in ILS

This should feed the reporting layer, while the original amount and currency remain visible for auditability.

#### F. Recurring amounts can change over time and should not rewrite history

Examples:

- rent increases in September
- salary changes in January
- electricity fixed plan changes mid-year

The product should treat recurring entries as time-based rules with effective dates.

Recommended MVP approach:

- recurring entries should support version history
- a change should create a new rule version with a start date
- past generated entries should remain unchanged unless the user explicitly chooses to recompute them

This avoids accidentally changing historical summaries when a recurring amount changes later.

#### G. Recurring and manual income should be supported, not only expenses

Examples:

- salary that is not imported from the source used for expense tracking
- recurring side income
- one-time annual bonus
- tax refund

The manual-entry system should support:

- recurring expenses
- recurring income
- one-time manual expenses
- one-time manual income

#### D. Monthly summaries should be based on normalized “expense events”, not only raw transactions

To support the cases above, the app should conceptually separate:

- raw imported transaction
- user-classified expense meaning
- reporting allocation across months

This allows one bank transaction to become:

- one expense event for August
- or two allocated expense events for May and June
- or a shared expense entry that also feeds the settlement feature later

## Feature 2: Shared Expense Balancing

This is important to keep in mind now, but can be implemented later.

### Goal

Track who paid for shared expenses and how much the other person owes.

### MVP-later capabilities

- select imported expenses and mark them as shared
- define split rules:
  - 50/50
  - custom percentages
  - one person paid for the other
- create manual shared expenses that are not in the bank CSV
- define recurring shared expenses
- show running balance between members
- show settlement suggestions

### Design implication now

Even if this feature is not built immediately, imported expenses should already support:

- a payer
- participants
- split type
- settlement status

## Feature 3: Investment Manager

This can be part of the first broader release, but should start simple.

### User inputs

- CSV exports from brokers, pension funds, savings funds, or investment platforms

### MVP capabilities

- upload investment account CSV files from different providers
- normalize holdings and transaction history
- show current allocation in a simple dashboard
- show percentage split across asset types such as:
  - cash
  - indexes
  - stocks
  - funds
- show portfolio value
- show gain/loss summary if available from the imported data
- optionally show buy and sell records

### Design implication

The app should treat investment imports separately from bank transaction imports, but both should feed a shared household financial picture.

## Suggested Release Plan

### Phase 1

- workspace and member setup
- bank CSV upload
- import template system
- normalized transaction storage
- monthly summary dashboard
- manual category and ownership correction

### Phase 2

- shared-expense selection from imported transactions
- manual shared-expense entry
- recurring shared expenses
- balance and settlement tracking

### Phase 3

- investment CSV upload
- holdings normalization
- allocation dashboard
- gain/loss and transaction views

### Phase 4

- combined finance insights
- savings trends
- financial planning calculations
- retirement and goal simulations

## Main User Flows

### Flow A: Monthly expense tracking

1. User creates a household workspace.
2. User adds members.
3. User uploads one or more bank CSV files.
4. App identifies the CSV format or asks the user to map columns.
5. App converts rows into normalized transactions.
6. User reviews and fixes categories or ownership.
7. App generates monthly summary by selected date range.

### Flow B: Shared expense tracking

1. User opens imported transactions for a month.
2. User marks specific items as shared.
3. User confirms who paid and how the item should be split.
4. App updates the running balance between members.

### Flow C: Investment overview

1. User uploads one or more investment CSV files.
2. App maps the provider format into holdings and activity records.
3. App updates allocation and portfolio summary dashboards.

## Core Domain Objects

These are the main product entities we should preserve when we design architecture.

### Workspace

A shared household or family account.

### Member

A person inside the workspace.

### Import Source

Metadata about a bank or investment provider format.

### Import Template

A mapping definition from a raw CSV format to the app’s internal model.

### Raw Import

The original uploaded file and metadata.

### Transaction

A normalized bank or cashflow record.

### Monthly Summary

A computed summary for a chosen date range.

### Shared Expense Entry

A transaction or manual entry marked as shared and tracked for settlement.

### Recurring Shared Expense Rule

A repeating shared item that may not appear in imported bank data.

### Investment Account

A source account from a broker or fund provider.

### Holding Snapshot

The current or imported state of asset allocation.

### Investment Activity

A buy, sell, dividend, fee, or cash movement event.

## Key Product Decisions To Preserve

These should guide the architecture later.

### 1. Normalize everything into internal models

Do not build features directly on raw CSV columns.

### 2. Separate raw imports from computed summaries

Users may re-upload corrected files or change mappings, so summaries should be recomputable.

### 3. Use transaction dates, not statement labels, as the source of truth

This is necessary to solve the bank “10th to 10th” problem.

### 4. Keep classification editable

Users will need to fix mistakes manually in early versions.

### 5. Make shared-expense logic an extension on top of transactions

This avoids duplicate data entry and keeps the system coherent.

### 6. Keep investment data as a parallel domain that still rolls into household-level insights

Expenses and investments are different data types, but the user sees them as one financial picture.

## Constraints

- must be cheap to run for a few early users
- should use free or low-cost deployment options
- should not depend on paid AI parsing services
- should tolerate messy CSV files
- should support future expansion without reworking core data structures

## Non-Goals For The First Iteration

- automatic syncing with banks through paid APIs
- real-time transaction ingestion
- advanced forecasting
- tax optimization
- complex investment analytics
- multi-country tax or banking support from day one

## Recommendation For Next Step

The next step should be architecture design around this product structure, with emphasis on:

- low-cost deployment
- import pipeline design
- normalized data model
- extensibility for shared expenses and investments
- clear separation between raw uploads, normalized records, and computed summaries
