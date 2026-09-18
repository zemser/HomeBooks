# Report line-item drill-down specification

## Status

Accepted for implementation. This is the source of truth for how a monthly report reveals the transactions behind a total.

It implements the transaction drill-down already required by `docs/focused-budgeting-experience-spec.md`. It does not change spending-scope vocabulary; that remains `docs/shared-spending-scope-spec.md`.

Do not start other product work in this change. Do not add category or person filters to History. Do not redesign Home, Transactions IA, year totals, export, auth, or RLS.

## Decision

Stay on **Reports** to answer “what is in this number?”

Selecting a total, spending-scope card, category row, matrix cell, or income tile **filters the existing Included line items list**. The user does not go to History for that question.

History stays the place to **edit** a row. A report line item may offer Open in History only after the user is looking at a specific imported transaction.

Do not add a Reports search/filter toolbar (person dropdown, category dropdown, review status, import, free-text search). The numbers already on screen are the filter. A second form would copy History and break the mapping between a total and its rows.

## Product intent

A finished month still leaves questions like:

- What did Lee spend personally?
- What is in Housing?
- What Housing was Shared?
- What income is attributed to Izzy?

Those questions are explanations of the month the user is already looking at. The contributing rows are already loaded as `report.lineItems`. Selection should reveal that subset, keep the amount visible, and be clearable.

Starter categories use **Housing**, not Home. Housing is a category. Shared is a spending scope. They are independent: shared rent is Housing + Shared, not a person’s personal Home bucket.

## Current state

Monthly Reports (`/reports?view=month`) already shows, in order:

1. completeness
2. Income, Total spent, Saved
3. Spending by scope (Personal · member, Shared)
4. Categories by spending scope (desktop matrix + mobile stacked cards)
5. Income attribution
6. Included line items for every reportable row in the selected month and reporting mode
7. Advanced reporting and FX

Those totals and cells are inert. The line-item table is always the full month.

Home “See category detail” and each top-category row currently open the whole month report, not that category.

History (`/transactions/all`) filters by search, review status, month, and import. It has no category or person filter. It also uses a different dataset:

| | Reports line items | History |
| --- | --- | --- |
| Rows | Classified personal, shared, and income | Imported rows of every type, including unreviewed, transfer, and ignore |
| Sources | Imported + cash + recurring in one list | Imported table plus a separate cash table |
| Period | Selected reporting mode (payment date or allocated) | Transaction-date month only |

Sending the user to History for “all Housing” cannot work today and would not match an allocated-period report.

## Non-goals

This change must not:

- add category, member, or spending-scope filters to History or Review
- add search, import, or review-status controls to Reports
- make Saved clickable (it is income minus expenses, not a row set)
- turn year view into a transaction list
- change reporting math, completeness, export files, or classification
- add edit, classify, or allocation forms on Reports
- deep-link cash or recurring rows into History in this version (History has `transactionId` only)
- rename Housing to Home

Follow-ups, not this change:

- category or person filters on History for recategorizing across months
- Open in Recurring / Open cash entry from a report row
- year-table cells that preselect a scope on the month report

## Target interaction

One selected slice at a time. Selecting a new control replaces the previous slice. Selecting the active control again clears it.

Filter the in-memory line-item list instantly. Do not wait for a new report query. Do not animate the table as a page transition.

When a slice is active:

- the chosen control looks selected (`aria-pressed="true"` or equivalent)
- the line-item heading groups the slice label, item count, amount, and Clear control together on desktop and mobile
- the selected month and reporting mode remain visible beside the heading; an in-progress month repeats the existing partial-data warning here
- a chip or Clear control removes the slice
- empty slices show “No items in this slice” plus Clear, never the full unfiltered table

Move keyboard focus to the line-item heading after a selection from the same page. Home and other deep links land on `#line-items`.

Provide **Back to summary** beside the line-item heading. It preserves the slice and returns scroll and focus to the control that opened it. If there is no same-page origin (a deep link or refresh), or that control no longer exists after a month/mode change, return to the monthly summary heading. Keep the last origin available after clearing so users can return to their comparison.

Clear or Escape removes the slice and keeps scroll and focus at the line-item heading, now describing the full list. If the user clears by activating the selected summary control again, keep focus on that control. Focus targets must be programmatically focusable without adding extra stops to normal tab order.

Pressable controls use the existing press feedback (`:active` scale). `@media (prefers-reduced-motion: reduce)` keeps the list swap as an instant filter with no transform.

## Selectable controls

Selectable only when `itemCount > 0` (or the matching amount is non-zero for primary totals). Zero cells stay text.

| Control | Slice |
| --- | --- |
| Income (primary total) | All income rows |
| Total spent (primary total) | All expense rows (personal + shared) |
| Saved | Not selectable |
| Spending-scope card Personal · Member | Personal rows for that member |
| Spending-scope card Shared | Shared rows |
| Category row total / category card heading | Expenses in that category, every spending scope (`kind=expense`) |
| Matrix cell / category-card scope amount | That category **and** that spending scope |
| Income attribution tile | Income rows for that member (or unassigned) |

Imported, one-time manual, and recurring-generated rows use the same matching rules.

## URL contract

Existing params stay: `view`, `month`, `mode`.

Add optional slice params, omitted when there is no selection:

| Param | Values | Meaning |
| --- | --- | --- |
| `kind` | `income` \| `expense` \| `personal` \| `shared` | Row class to keep |
| `member` | workspace member UUID, or `unassigned` | Required for `personal`. Optional for `income`. Forbidden for `expense` and `shared`. |
| `category` | workspace category UUID, or `uncategorized` | Restrict to that category |

`view=year` ignores slice params. Year month-name links continue to open that month and must drop slice params.

Examples:

```
/reports?view=month&month=2026-04&mode=payment_date
/reports?view=month&month=2026-04&mode=payment_date&kind=personal&member=<leeId>#line-items
/reports?view=month&month=2026-04&mode=payment_date&kind=expense&category=<housingId>#line-items
/reports?view=month&month=2026-04&mode=payment_date&kind=shared&category=<housingId>#line-items
/reports?view=month&month=2026-04&mode=payment_date&kind=income&member=<izzyId>#line-items
```

`buildReportsHref` and every in-report Month/Year/mode control must preserve a valid slice when staying on month view, and must drop it when switching to year view.

Category totals and Home category links always include `kind=expense`. For a category-only URL with no member, normalize the missing kind to `expense` before matching and serialize the canonical URL. Category + personal/shared retains that scope; an explicit income kind remains income-only.

Invalid or contradictory params (`kind=shared&member=…`, unknown UUID, unsupported kind, `kind` missing while `member` is present, or personal without a member) produce an unavailable-filter state, not an unfiltered list and not a 404. Keep the requested slice params until the user explicitly clears them. At `#line-items`, show “This filter is no longer available” with **Show all items**. That action removes all slice params, preserves month/mode, reveals the full list, and focuses its heading. The monthly summaries remain visible with their normal labels.

Validate member/category ids against workspace records, including inactive historical members and retained historical categories, rather than only the current month's line items. A valid member/category with no activity in this month keeps its slice and shows “No items in this slice,” zero items, and a zero amount. It must remain valid when changing months or reporting modes.

The URL is the source of truth. Refresh, back, and copy-paste keep the slice.

## Matching rules

Expose stable ids on each line item. Do not match on display names.

Add to `MonthlyReportLineItem` (already present on internal `ReportRecord`):

```ts
categoryId: string | null;
memberId: string | null;
```

`memberId` is the existing report-scope member: personal owner for `personal`, income recipient for `income`, otherwise null. Shared rows do not use `member` in the URL.

```ts
type ReportLineItemKind = "income" | "expense" | "personal" | "shared";

type ReportLineItemSlice = {
  kind?: ReportLineItemKind;
  memberId?: string | "unassigned";
  categoryId?: string | "uncategorized";
};

function lineItemMatchesSlice(item: MonthlyReportLineItem, slice: ReportLineItemSlice) {
  if (slice.kind === "income" && item.classificationType !== "income") return false;
  if (slice.kind === "expense" && item.classificationType !== "personal" && item.classificationType !== "shared") return false;
  if (slice.kind === "personal" && item.classificationType !== "personal") return false;
  if (slice.kind === "shared" && item.classificationType !== "shared") return false;

  if (slice.memberId === "unassigned" && item.memberId !== null) return false;
  if (slice.memberId && slice.memberId !== "unassigned" && item.memberId !== slice.memberId) return false;

  if (slice.categoryId === "uncategorized" && item.categoryId !== null) return false;
  if (slice.categoryId && slice.categoryId !== "uncategorized" && item.categoryId !== slice.categoryId) return false;

  return true;
}
```

Present params are ANDed. Absent params do not restrict after category-only URL normalization. The matching helper receives only a validated, normalized slice; an invalid slice must never become an empty filter object that matches everything.

The filtered list’s amounts must reconcile to the control that produced the slice:

- Personal · Lee amount = sum of matching expense magnitudes
- Shared amount = sum of matching shared rows
- Housing row total = sum of that category across scopes
- Housing × Shared cell = that intersection
- Income tile = that member’s income
- primary Income / Total spent = those full buckets

Use the same money helpers as the report. Do not re-sum in the client with a different rounding path if the server already has the slice total on the clicked summary.

## Slice label

Show a short label next to the line-item heading, for example:

- `Income`
- `Total spent`
- `Personal · Lee`
- `Shared`
- `Housing`
- `Housing · Shared`
- `Income · Izzy`
- `Uncategorized`
- `Personal · Unassigned`

Reuse existing scope labels and category names. Do not invent a Home label for Housing.

## Line-item context and source details

The line-item heading must identify the selected month and reporting mode even when reached directly through `#line-items`. Reuse the report's existing completeness data and partial-data wording here; do not introduce a second completeness calculation. Keep this context visible in empty and unavailable-filter states too.

In adjusted-period mode, label the row amount **Included this month**. Secondary row details show the source payment/event date and the full source amount in workspace currency, separately from the allocated amount. Existing original-currency and FX details remain distinct. For example, a 600 ILS bill paid in August with 300 ILS allocated to June shows 300 ILS included in June, with the August payment date and 600 ILS full source amount in details.

Extend both the internal report record and `MonthlyReportLineItem` with source context in both modes:

```ts
sourceEventDate: string | null; // Original payment/event date, never the allocation month.
sourceNormalizedAmount: number | null; // Full source amount in workspace currency, before allocation.
```

For imported rows, these values come from the source transaction. For manual and recurring-generated rows, use the source entry/event. Keep `eventDate` as the existing report display date (allocation month in adjusted-period mode). Pass source context through the existing report load; do not fetch it per slice or per row. If a source cannot be resolved, show “Source details unavailable” instead of substituting the allocation date or amount.

## Home

Keep the header link **See category detail** pointed at the unfiltered month report.

Each top-category row becomes a link to that month’s report with `kind=expense`, `category` set, and `#line-items`. Uncategorized uses `kind=expense&category=uncategorized`. Income must never appear in a spending-category drill-down, even when it shares the category or has no category.

Do not add member or scope chips on Home in this change.

## Open in History

Reports stay read-only.

For `sourceKind === "imported_transaction"` with a `sourceRecordId` and resolved `sourceEventDate`, the row includes:

```
/transactions/all?transactionId=<sourceRecordId>&month=<YYYY-MM>
```

`month` is derived from `sourceEventDate` in both reporting modes. Do not derive it from the display `eventDate`, which is the allocation month in adjusted-period mode. A bill paid in August and allocated to June must open August History and focus that source transaction. If the source date is unavailable, omit the History link rather than guessing the month.

Cash and recurring rows have no History `transactionId` contract in this version. Do not invent a broken link.

Do not send the user to History as the way to see a category or person. The completeness link **Confirm people in History** stays as-is; that is an edit task.

## Accessibility and responsive behavior

- Scope cards, primary totals, matrix cells, and category amounts that are selectable are buttons or links, not clickable `<td>` text without a control
- Selected control: `aria-pressed="true"` (button) or `aria-current="true"` (link)
- Slice chip has an accessible name, e.g. `Clear Housing, Shared filter`
- Desktop matrix and mobile category cards offer the same slices
- Line-item table keeps semantic headers
- Meaning is not color-only; the heading text names the slice
- Keyboard: controls are in tab order; Enter/Space selects; Escape clears the slice when focus is on the report
- Back to summary, Clear, Escape, and Show all items follow the focus rules above; clearing never leaves focus on a removed control
- Month, reporting mode, partial-data warning, and allocation/source amount labels are readable at the list on mobile as well as desktop

## Implementation plan

Keep this on the existing monthly report page. Prefer a small client island for selection and list filtering if the rest of the page stays a server component. Parsing the slice from `searchParams` on the server is also valid; do not add a database query per slice.

### Deliverables

1. Parse/serialize/match helpers with unit tests
2. `categoryId`, `memberId`, and original source date/full amount on `MonthlyReportLineItem`
3. Selectable month-report controls that write the URL slice
4. Filtered Included line items section, valid-empty and unavailable-filter states, grouped selection/context header, clear control, Back to summary, `#line-items`, and source details for allocated rows
5. Home top-category row links
6. Open in History on imported line items only
7. Tests below

### Likely code areas

- `src/features/reporting/monthly-report.ts`
- `src/features/reporting/presentation.ts` (optional href helpers)
- `src/app/(app)/reports/page.tsx`
- `src/app/(app)/page.tsx`
- `tests/review/reporting-presentation.test.ts`
- a new `tests/review/report-line-item-slice.test.ts`
- Playwright coverage beside `tests/e2e/` report tests if one already loads `/reports`

### What not to touch

- History query contract (`src/features/expenses/history-query.ts`)
- Review filters
- Year export routes
- Completeness and aggregation math; changes to report loading are limited to passing through ids, source context, and workspace metadata needed to validate slices
- Primary navigation

## Test plan

### Unit

- `kind=personal&member=<id>` keeps only that member’s personal rows
- `kind=shared` excludes personal and income
- `kind=expense&category=<housingId>` keeps Housing across personal and shared, excluding income in the same category
- a category-only URL normalizes to `kind=expense` before matching and serializes canonically
- `kind=shared&category=<housingId>` is the intersection
- `kind=income` and `kind=income&member=<id>`
- `kind=expense` is personal + shared, never income
- `kind=expense&category=uncategorized` excludes uncategorized income
- `member=unassigned` works with personal/income kinds
- malformed, unknown, and contradictory slice params produce an unavailable-filter state and remain in the URL until explicitly cleared
- valid workspace members/categories with no matching rows remain valid empty slices, including inactive historical members
- line-item ids are stable (`categoryId`, `memberId`) and not derived from labels
- filtered sum equals the clicked summary for two-member Housing/Shared fixtures

### Integration / review tests

- Reports href builder preserves month/mode and a valid slice
- Year switch drops slice params
- Home category row href includes `kind=expense`, `category`, and `#line-items`
- Imported Open in History uses `transactionId` + source payment-date month in both modes; an August payment allocated to June opens August History
- source date and full normalized amount survive report mapping independently of allocation date/amount
- missing source context does not fall back to allocation values or produce a guessed History link
- Cash and recurring rows do not render a History link
- changing month/mode preserves a valid slice even when the destination has zero matching items

### End-to-end

1. Open a month report with personal, shared, Housing, and income rows, including income sharing an expense category and uncategorized income/expenses.
2. Select Personal · Lee; the line-item list and heading match; refresh keeps the slice.
3. Select the Housing × Shared cell; the list is that intersection.
4. Clear returns the full month list and focuses its heading; Back to summary returns to the original control. Activating an already-selected summary control clears without moving focus away from it.
5. From Home, open a top category; Reports shows only that category’s expense rows. Repeat for Uncategorized. The month, mode, and any partial-data warning are visible beside the list heading.
6. In adjusted-period mode, open a June allocation of an August payment. Verify Included this month differs from the full source amount shown in details; Open in History opens August and focuses the same source transaction.
7. Keyboard: tab to a scope card, activate, see the list, Escape clears and focuses the heading. Back to summary works on desktop/mobile and falls back to the summary heading after a direct deep link.
8. Open an invalid slice URL; an unavailable-filter message appears with no unfiltered line items. Refresh preserves that state. Show all items explicitly clears it and focuses the full-list heading.
9. Change month/mode to a period with no matches for a valid slice; the filter remains with zero items/amount. Browser Back restores the prior month/mode/slice.

## Definition of done

- A user can see all Housing expense rows, all of one person’s personal rows, and Housing × Shared, without leaving Reports
- History gained no new filters
- Reports gained no search toolbar
- Slice URLs are copyable and survive reload
- Category spending slices never include income, including Uncategorized
- Invalid filters require an explicit Show all items action; valid empty filters remain selected
- Users can return from the list to the originating summary control, with predictable focus after clear and Escape
- Deep-linked lists show month, reporting mode, and any partial-data warning
- Adjusted-period rows distinguish the included amount from source details, and imported History links use the original payment month
- Zero-item cells are not selectable
- Saved is not selectable
- Allocated-period and payment-date reports both filter the rows they already display
- Completeness, totals, export, and Transactions workflow are unchanged
