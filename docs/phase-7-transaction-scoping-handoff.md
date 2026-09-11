# Phase 7 implementation handoff: month and statement scoping

## Outcome

Implement Phase 7 from `docs/focused-budgeting-experience-spec.md`. This is a scoping and browse-defaults change inside the existing Transactions workflow. It is not another information-architecture rewrite.

The finished application should have:

- Review opening on a statement or a month, never on all-time completion as the default headline
- History (today's All transactions tab) opening on a month, never on every imported row
- statement drill-downs that keep their import id
- transaction focus links that keep `transactionId` and land in that row's month
- server-side filtering and pagination for History, matching Review's page size contract
- complete saved statements remaining visible as a library, not only as unfinished queue items

Do not add a fourth Transactions tab. Do not merge Review into History. Do not change classification, payer, reporting math, export, auth, RLS, or the four-item primary navigation.

## Product intent

Users finish **months** and **uploaded statements**. They do not browse a lifetime ledger.

Those two units are not the same. Bank files often span mid-month to mid-month, so one statement can contribute to several calendar months, and one month can contain rows from several statements. Home and Reports already use calendar months. Import save and Review already know how to target one statement with `?import=`. This phase makes those the default units and demotes the all-time dump.

Live example from the current Household Workspace:

| Surface | What it shows today | Useful number |
| --- | --- | --- |
| Home · April 2026 | 5 of 15 imported rows reviewed | 10 left this month |
| Review · All imported statements | 88 remaining, 12 handled, 12% complete | lifetime pile |
| All transactions | 100 of 100 rows, All months, All imports | archive dump |
| Saved statements | `cal april.xlsx` 41/52, `cal march.xlsx` 47/48 | the real work units |

Home already has the right model. Review and History should follow it.

## Current state reviewed

- Canonical routes already exist: `/transactions`, `/transactions/review`, `/transactions/all`.
- Review URL state already uses `q`, `month`, `import`, `account`, `min`, `max`, `sort`, `view`, `page`, `pageSize`, and `transactionId`. Omitted `import` currently means `all`. `serializeReviewFilterState` deletes `import` when the value is `all`, so the all-statements view has a clean URL and cannot be distinguished from an unresolved landing.
- Review's hero stats use `summary.totalTransactionCount` / `summary.reviewedCount` when `import=all`. That is lifetime handled / total, including already-complete history. The switcher only lists incomplete imports and slices to five.
- Home's in-progress CTA already targets `/transactions/review?month=YYYY-MM`. Import save already targets `/transactions/review?import=<id>`. Both of those entry points are correct and must keep working.
- `/transactions/all` only reads `transactionId`. Month and import filters are client-only defaults of `all`. `listExpenseTransactions()` and `GET /api/expenses` load every workspace row. Review paginates; History does not.
- First-party unscoped History links:
  - Import saved-statement "Ledger" -> `/transactions/all`
  - Import save success "all transactions" -> `/transactions/all`
  - Review selected row "Open in ledger" -> `/transactions/all?transactionId=...` (focus is kept; month is not)
  - Review queue-clear "Open ledger" -> `/transactions/all`
- User-facing copy still says "ledger" and "complete history".
- `getLatestFinancialActivityMonth()` already exists and is what Home uses when `/` has no `month`.
- `listSavedImports()` already returns per-file `reviewPendingCount`, reviewed counts, and activity date range. Review should reuse that library rather than invent a third import list.
- Next.js 16.3.0 App Router with Cache Components and Partial Prefetching. Keep request-specific financial data behind Suspense. Do not encode the top-level Transactions tab in Review's `view=` parameter.

Product decision: there are still no production users or external bookmarks that must keep the all-time Review landing. Bare `/transactions/review` and `/transactions/all` may change what they resolve to. Explicit query values must still be honored.

## What not to change

- Route paths. Keep `/transactions`, `/transactions/review`, and `/transactions/all`.
- Primary navigation, `/more`, pending-review badge query, and badge placement. The badge stays the all-time pending count. That is an attention signal, not a completion percentage.
- Import upload, preview, save, duplicate detection, and the post-save primary CTA into `/transactions/review?import=...`.
- Review keyboard shortcuts, bulk classify, merchant rules, suggestions, allocation editing, and classification validation.
- Reporting, export, payer columns, settlements, recurring, investments, auth, and RLS.
- No schema migration and no `drizzle-kit push` for this phase.

## Canonical scope contract

Two browse units:

| Unit | Meaning | Typical entry |
| --- | --- | --- |
| Calendar month | Payment-date month of the transaction, same as Home / Reports completeness | Home CTA, History tab, Reports-adjacent lookup |
| Statement | One saved bank import | Import save, saved-statement Review / History links, Review switcher |

A row can belong to both. Filters intersect when both are present.

### Review

| Request | Resolved scope | URL after client sync |
| --- | --- | --- |
| `/transactions/review` with no `import` and no `month` | latest incomplete statement, if any | `?import=<id>` |
| `/transactions/review?import=<id>` | that statement | unchanged |
| `/transactions/review?import=all` | all remaining rows | `import=all` stays in the URL |
| `/transactions/review?month=YYYY-MM` and no `import` | that month, all statements | do not auto-pick a statement |
| `/transactions/review?import=<id>&month=YYYY-MM` | intersection | unchanged |
| no incomplete statements | existing queue-clear state | no forced import id |

Latest incomplete statement: the same order Review already uses for `remainingByImport` (latest transaction date, then remaining count, then import `createdAt`). Use the first row. If the queue is empty, show the current queue-clear card.

Hero stats:

- Statement scope: keep today's statement header (filename, activity period, remaining, handled, percent complete for **that file**).
- Month scope: title is the month label (e.g. April 2026). Remaining / handled / percent are for imported rows in that month only.
- Explicit `import=all`: title is remaining work across statements, for example `88 remaining across 2 statements`. Do **not** show lifetime percent complete. Lifetime handled / total may appear as helper text, not as the primary meter.

Statement switcher:

- List every completed bank import, not only incomplete ones.
- Incomplete first, then complete.
- No five-item cap. Reuse `listSavedImports()` progress fields.
- Keep an explicit **All remaining** action that writes `import=all`.
- Complete files stay visible with a Complete badge and still open that statement's queue (empty remaining is allowed; show the existing "Statement complete" empty state).

Clear all filters restores a fresh Review landing: latest incomplete statement, or queue-clear. It must not restore lifetime `import=all` unless that is the only remaining option.

Do not 302/307 the Review page merely to add `import=`. Resolve the default on the server for first paint, pass the resolved `importId` in the page payload, and let the existing `replaceState` URL sync write it. Prefetching and instant navigation must not first paint the all-time queue and then snap to a statement.

`parseReviewFilterState` / `serializeReviewFilterState` must distinguish omitted `import` from explicit `import=all`. Today those are the same. After this phase:

- omitted `import` on the Review landing means "resolve default"
- `import=all` means the user chose all remaining
- serialize must keep `import=all` in the URL when that is the active scope

The pending-review badge on Transactions and on the Review tab stays all-time pending. Do not make the badge month-scoped.

### History

Visible tab label: **History**. Href stays `/transactions/all`.

| Request | Resolved scope | URL after client sync |
| --- | --- | --- |
| `/transactions/all` with no `month`, `import`, or `transactionId` | latest financial activity month from `getLatestFinancialActivityMonth()` | `?month=YYYY-MM` |
| `/transactions/all?month=YYYY-MM` | that month | unchanged |
| `/transactions/all?month=all` | explicit all-months, still paginated | `month=all` stays in the URL |
| `/transactions/all?import=<id>` | that statement's rows, all months in the file | do not force a month |
| `/transactions/all?import=<id>&month=YYYY-MM` | intersection | unchanged |
| `/transactions/all?transactionId=<id>` | that row, and the month of that row unless `month` is already present | keep `transactionId`; write `month` if it was omitted |

History is a lookup, not a second review queue. Classification still happens in Review. History may still edit an already-classified row and allocation, matching today's ledger behavior.

Landing chrome:

- Remove the duplicate outer "Ledger actions" card on `src/app/(app)/transactions/all/page.tsx`.
- Keep a single page-level next action when the **visible scope** still has pending imported rows, using that scope's count, not the all-time 88.
- One "Open reports" link is enough, and it should target the selected month when a month is selected.
- Drop duplicated Review / Reports buttons from the imported-transactions table header.

Manual entries are month objects, not import objects:

- Month scope: show that month's one-time manuals and allow add/edit/delete as today.
- Import-only scope (`import` set, `month=all`): hide the saved-manuals table. Keep "Add manual transaction". The new entry still requires an event date and then belongs to that date's month.
- Do not load every historical manual entry onto the page.

Pagination and loading:

- Default page size 50, max 100, same as Review.
- Filter and paginate imported rows on the server. Do not load the full workspace into the client and then filter.
- Month and import dropdown options come from dedicated distinct queries (or `listSavedImports()`), not from the current page of rows.
- `GET /api/expenses` must accept the same query the page uses so client reloads stay scoped.

### Cross-links

Update every first-party History link so it keeps the unit the user was looking at:

| Source | Current href | Target href |
| --- | --- | --- |
| Saved statement Review | `/transactions/review?import=<id>` | unchanged |
| Saved statement Ledger | `/transactions/all` | `/transactions/all?import=<id>` |
| Import save success secondary History link | `/transactions/all` | `/transactions/all?import=<id>` of the saved file |
| Review "Open in ledger" | `/transactions/all?transactionId=<id>` | `/transactions/all?transactionId=<id>&month=YYYY-MM` using the row's payment month |
| Review queue-clear History | `/transactions/all` | `/transactions/all?month=<latestTransactionMonth>` when that month exists |
| Home in-progress | `/transactions/review?month=...` | unchanged |
| Home empty-month | `/transactions` | unchanged |
| Home recent activity filenames | currently not links | optional: `/transactions/review?import=<id>` when pending, otherwise `/transactions/all?import=<id>`. Do this if it is cheap; do not block the phase on it. |

User-facing copy: replace "ledger" and "complete history". Preferred terms are History, this month, and this statement.

Transactions layout subtitle should describe the job, for example: `Import a statement, review it, and check a month.` Do not promise a complete lifetime history.

## Recommended code shape

Keep the shared Transactions layout. Change defaults, queries, copy, and cross-links.

```text
src/features/expenses/review-query.ts          distinguish omitted import vs import=all; resolve Review landing
src/features/expenses/review-filtering.ts      serialize import=all; stop treating omitted as all
src/features/expenses/queries.ts               History query + pagination; Review summary by month/statement
src/app/(app)/transactions/review/page.tsx     pass resolved scope into ReviewQueueClient
src/app/(app)/transactions/all/page.tsx        parse month/import/page; drop duplicate ledger chrome
src/app/api/expenses/route.ts                  accept the History query
src/components/expenses/review-queue-client.tsx
src/components/expenses/expenses-page-client.tsx
src/components/imports/import-preview-client.tsx
src/components/transactions/transactions-workflow-nav.tsx
```

Suggested History query type, parallel to Review:

```ts
type HistoryQuery = {
  month: string; // YYYY-MM or "all"
  importId: string; // uuid or "all"
  searchQuery: string;
  reviewStatus: "all" | "needs_review" | "reviewed";
  page: number;
  pageSize: number;
  transactionId?: string;
};
```

Resolve defaults in one server helper used by both the History page and `GET /api/expenses`. Reuse `getLatestFinancialActivityMonth()` for the month landing. Do not add a second latest-month query.

Review default import resolution should use the existing remaining-by-import ordering, not import `createdAt` alone.

`listReviewQueue` already loads unclassified rows for the workspace and then filters in memory. Do not take a performance rewrite of the Review queue in this phase unless the default statement scope makes a cheap `importId` SQL filter obvious and local. History **must** stop selecting every transaction in the workspace.

## Implementation sequence

1. Add Review parse/serialize distinction for omitted `import` vs `import=all`, plus server-side default statement resolution. First paint and URL sync must agree. Update Review hero copy for `import=all` and month scope. Expand the statement switcher to the full saved-import library, incomplete first, no five-item cap.
2. Add History query parsing, default month resolution, server-side filters, pagination, and `GET /api/expenses` query support. Change the tab label to History. Remove duplicate ledger chrome. Scope manuals to the selected month.
3. Retarget first-party History links and replace ledger copy. Focus links include `transactionId` and month.
4. Update source-inspection, navigation, review-workflow, accessibility, and instant-nav tests. Add focused default-scope tests.
5. Run lint, review tests, focused Playwright, and a production build. Check desktop and the existing mobile navigation breakpoint.

## Required test coverage

Add focused Phase 7 coverage for:

- bare `/transactions/review` first paint is the latest incomplete statement, not all-time remaining, and the URL gains `import=<id>`
- `/transactions/review?import=all` keeps all remaining rows and does not auto-pick a statement
- `/transactions/review?month=YYYY-MM` stays month-scoped and does not auto-pick a statement
- `/transactions/review?import=<id>` still restores that statement, including a completed statement
- Review hero for `import=all` does not present lifetime percent complete as the primary stat
- statement switcher includes a completed import and more than five imports when fixtures have them
- Clear all filters does not land on lifetime `import=all` when an incomplete statement exists
- bare `/transactions/all` first paint is the latest activity month and the URL gains `month=YYYY-MM`
- `/transactions/all?month=all` is explicit and paginated; it is not the landing default
- `/transactions/all?import=<id>` shows that statement across its activity months
- `/transactions/all?transactionId=<id>` focuses the row and uses that row's month
- History page and `GET /api/expenses` do not return the full workspace when a month is selected
- saved-statement History link includes `import=`
- Review "Open in ledger" / History focus link includes `transactionId` and `month`
- History tab label is History; href remains `/transactions/all`
- workflow tabs, pending-review badge, and four-item mobile nav still match Phase 4
- `/transactions/review` and `/transactions/all` still pass the existing serious/critical axe scan
- canonical routes retain shell-first instant navigation; Review must not flash the all-time queue before the resolved statement

Update tests whose copy, hrefs, or "default queue" assumptions change:

- `tests/e2e/transactions-navigation.spec.ts`
- `tests/e2e/review-workflow.spec.ts` (Clear all / default queue, Open in ledger)
- `tests/e2e/category-surfaces.spec.ts`
- `tests/e2e/accessibility.spec.ts`
- `tests/instant/app-navigation.spec.ts`
- `tests/review/transactions-information-architecture.test.ts`

Keep Review keyboard, bulk, merchant-rule, and allocation tests green. They should not need behavior changes.

If a test fixture has only one incomplete import, still assert that bare Review writes `import=` rather than leaving a clean `/transactions/review` URL.

## Verification commands

```bash
npm run lint
npm run test:review
npm run test:instant
npm run test:e2e -- tests/e2e/transactions-navigation.spec.ts tests/e2e/review-workflow.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/category-surfaces.spec.ts
npm run build
```

If the Playwright grep does not match the final titles, run the relevant spec files directly. Also verify at widths above and below the existing 1024px navigation breakpoint.

Read Next.js 16 docs under `node_modules/next/dist/docs/` before changing Review/History routing, URL sync, or redirects. Prefer resolving defaults in the existing server loaders over adding compatibility redirects.

## Acceptance checklist

- [ ] Bare Review opens the latest incomplete statement and syncs `?import=<id>`.
- [ ] Home's `?month=` Review CTA stays month-scoped and is not overridden by a statement default.
- [ ] Import save still lands on `/transactions/review?import=<id>`.
- [ ] Explicit `?import=all` remains available and does not headline lifetime percent complete.
- [ ] Statement switcher shows complete and incomplete files with no five-item cap.
- [ ] Bare History opens the latest activity month and syncs `?month=YYYY-MM`.
- [ ] History is paginated on the server; the client does not receive the full imported history on landing.
- [ ] Statement and transaction deep links keep their scope.
- [ ] Manual entries follow the selected month and are not dumped as a lifetime list.
- [ ] User-visible "ledger" / "All transactions" tab wording is gone; the URL `/transactions/all` remains.
- [ ] Pending-review badge remains the all-time pending count.
- [ ] No schema, RLS, reporting-math, export, payer, or primary-nav changes.
- [ ] Focused tests, lint, instant nav, and build pass, aside from documented pre-existing failures.

## Baseline caveats found before implementation

- `tests/e2e/review-workflow.spec.ts` loads `/api/imports/review` without `import` as a fixture helper. Keep that API omitted-`import` behavior as "all remaining" **for the JSON API** if changing it would break the helper, but then the **page** must resolve the UI default separately and pass an explicit `import` on subsequent client fetches. Do not let the client refetch omitted-import as all-time after a scoped first paint.
- `serializeReviewFilterState` currently deletes `import=all`. That is the bug that makes landing and all-remaining indistinguishable. Fixing it will change Review URLs; update assertions that expect a clean `/transactions/review` after Clear all.
- `listExpenseTransactions()` has no limit. History pagination is required, not optional, even for current ~100-row workspaces.
- Performance budgets already include `/transactions/all`. Do not ignore `scripts/check-performance-budgets.ts` if the page starts issuing extra queries; prefer one scoped list plus cheap distinct option queries.
- `npm run test:review` has previously failed when `docs/tuning-001-index-evidence.md` is missing. That is unrelated.
- Use Node 22, matching `package.json`.
- Preserve unrelated working-tree files such as `AGENTS.md`, `CLAUDE.md`, and `next-env.d.ts` unless the user asks to include them.

## Agent brief

Implement this handoff end to end. Read the Next.js 16 documentation under `node_modules/next/dist/docs/` before editing Review/History URL sync. Keep Phase 4 routes, Phase 5 payer fields, and Phase 6 export unchanged. Prefer resolving month/statement defaults in the existing server loaders and `replaceState` URL sync over new routes or redirects. Do not treat All remaining / All months as the landing default. Do not load the full transaction table into the History client. Verify bare Review, Home month CTA, import-filtered Review, bare History, statement History, and `transactionId` focus before declaring the phase complete.
