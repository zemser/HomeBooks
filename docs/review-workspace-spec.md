# Review workspace specification

## Status

Ready to implement. Replaces the rolled-back layout in #142 and #143. Those pulls locked `.app-shell` / `.page-shell` to `100dvh`, changed `.app-main-scroll` from `overflow-x: hidden` to `overflow-x: clip`, and gave the queue `min-height: 26rem`. The shared scroller clipped Review and every other page. This spec keeps the product goal. It does not lock those shells, and it does not change their overflow.

## Product

Review is a split workspace. Clicking a row classifies that transaction in the right panel. Checkboxes mark rows to classify together. A statement page can hold up to 50 rows (`DEFAULT_REVIEW_PAGE_SIZE`).

Today the page is one long document. The panel is sticky, and a batch is a separate **Classify selected** bar at the top of the list that opens a dialog. After you scroll, that bar is gone, and it competes with **Save and next**.

The workspace should do two things:

1. On a desktop window, the queue table scrolls in place and the classify panel stays on screen.
2. Checking two or more rows turns that same panel into the batch form. There is one save target.

Phone layout stays a scrolling page. The panel sits below the list. A batch is a dialog opened from a bottom bar, and the panel still saves only the highlighted row.

Import, History, Reports, and every other page keep document scroll and their current tables.

## Current code

- Page: `src/app/(app)/transactions/review/page.tsx`
- Shared chrome: `src/app/(app)/transactions/layout.tsx` and `src/components/transactions/transactions-workflow-nav.tsx`. Slice 3 owns this header; it is the same on every Transactions tab.
- Client: `src/components/expenses/review-queue-client.tsx`
- Styles: review rules in `src/app/globals.css` (`.review-layout`, `.review-detail`, `.review-batch-bar`, `.review-toolbar`)
- Scrollport: `.app-main-scroll`. `overflow-x: hidden` makes the used `overflow-y` `auto`. Measure the board inside this element. Do not treat `100dvh` as the available height.
- Shell padding that sits after the board: `.page-shell` is `padding: 2rem 1rem 4rem`. At `max-width: 1024px`, `.app-main-scroll` also has `padding-bottom: 8rem`, and `.app-mobile-nav` is `position: fixed`. The sidebar hides at `1024px`, not at the Review stack breakpoint.
- Table: `.data-table` is `border-collapse: collapse` and `min-width: 42rem`. `.review-table` overrides that to `min-width: 52rem`. Card layout for the queue starts at `max-width: 640px`.
- Bulk save already posts to `/api/transaction-classifications/bulk` and undo already posts to `/api/transaction-classifications/undo`
- `applyQueueData` already drops marked ids that are not on the current page
- `CategoryCombobox` in the dialog remounts on `isBulkModalOpen`. Desktop never opens that dialog, so the remount key has to change when the bulk form is reset or replaced
- Tests: `tests/e2e/review-workflow.spec.ts`, `tests/review/review-bulk-classification-form.test.ts`

No API, schema, or query changes.

## Layout breakpoint

`961px` is the existing Review stack breakpoint in `globals.css`.

- **Wide:** viewport width at least `961px`. Two columns. Inline batch panel. Slice 2 may lock the board height.
- **Stacked:** viewport width at most `960px`. One column, document scroll, batch dialog. Slice 2's height lock does not apply.

`961–1024px` is still wide for the two columns, and it still shows the sticky mobile header and the fixed tab bar. The height measurement has to clear that bar. The batch UI in that band is the inline panel, not the phone dialog.

Use one shared query, `(max-width: 960px)`, in CSS and in the client. Subscribe with `useSyncExternalStore` and `matchMedia`. The server snapshot is stacked = false, so the first paint matches desktop CSS, then a phone updates after hydration. Do not read `window.innerWidth` once in an effect. Do not also write `min-width: 961px` as a second source of truth.

Crossing from stacked to wide while the dialog is open closes the dialog and keeps the bulk form, so the panel can show it. Do not call `closeBulkClassification` on that path; that helper resets the form. Crossing from wide to stacked does not open the dialog.

## Motion

Checking rows is constant. The panel swap is an opacity cross-fade of about 150ms, `cubic-bezier(0.23, 1, 0.32, 1)`. Do not slide the panel, and do not animate the board's height. Keyboard shortcuts are instant. Under `prefers-reduced-motion: reduce`, keep a short opacity fade and drop movement. Buttons already use `transform: scale(0.97)` on `:active`; do not add a second press animation.

If the phone bar uses a blurred background, match `.app-mobile-nav`: under `prefers-reduced-transparency: reduce`, use a solid background and no `backdrop-filter`.

## Slice 1 — One panel, one save

Ship this alone. Do not change shell overflow, page height, or the page sticky offsets in this slice. Do split the panel into a scrolling body and a footer so the save actions sit outside the scroller.

### Modes

`isBatching` is `selectedIds.length >= 2`.

| Marks | Wide panel | Stacked panel | Save |
| --- | --- | --- | --- |
| 0 | Single-row form for the highlighted row | Same | **Save and next** or **Save classification** |
| 1 | Same single-row form, plus "Check more rows to classify them together in this panel." | Same hint. No bottom bar | Still saves that one row only |
| 2 or more | Batch form | Single-row form stays. Helper: "Saving here classifies this row only." Bottom bar opens the dialog | Wide: **Apply to N transactions**. Stacked: dialog **Apply to selected** |

One marked row is not a batch on either layout. **Classify selected** is not offered until two rows are marked.

Checking a box still focuses that row (`setSelectedTransactionId`), including while batching. The highlighted row and the batch are different. Saving one row never applies to marked rows. Applying a batch never saves only the highlighted row.

### Panel structure

Keep `.review-detail` sticky (`top: 9rem`, `max-height: calc(100vh - 10rem)`). Change the article from one scrolling box into a column:

- Header, natural height
- `.review-detail-body`: `flex: 1 1 auto`, `min-height: 0`, `overflow: auto`, `overscroll-behavior: contain`
- `.review-decision-actions`: `flex: none`, a sibling after the body

The article is `display: flex; flex-direction: column; overflow: hidden` so the footer stays on screen. Do not pin the actions with `position: sticky` inside the body. A sticky footer covers the last field.

### Wide batch panel

Replace the panel header while batching:

- Eyebrow: `Together`
- Heading: `N transactions`
- Helper: `One classification applies to every marked row.`

Body, top to bottom:

- A preview list of up to 4 marked rows that are in the current `queue`: merchant and amount. If more are marked, one more line: `N more`. Marked ids are already limited to the current page by `applyQueueData`.
- The same fields the dialog uses today: treatment, category (hidden for transfer and ignore), member attribution, split for settlement, and the empty-categories hint.

Footer:

- **Apply to N transactions** (primary)
- **Clear marks** (secondary). Clears every mark, resets the bulk form, and returns to the single-row form for the highlighted row. It does not save.

Remove the in-list **Classify selected** button and the "N marked for batch" bar on wide layouts. Keep **Mark all N on this page** when nothing is marked. The queue heading can use the existing `.sr-only` class. Do not use `display: none`; the heading stays in the accessibility tree. The table remains the queue.

The dialog stays in the tree for the stacked path. It stays closed on wide layouts.

### Stacked batch

When `isBatching` and the layout is stacked:

- Show a fixed bar over the mobile nav: `N marked`, **Classify selected**, **Clear marks**.
- **Classify selected** opens the existing dialog (`openBulkClassification`) with the current bulk form.
- The dialog copy, fields, **Apply to selected**, and **Cancel** stay as they are.
- The inline panel does not switch into the batch form. It keeps the single-row form and the sentence "Saving here classifies this row only."

Do not show this bar for a single mark.

Place the bar by measuring `.app-mobile-nav`, not with a copied `5.6rem` offset. Set `bottom` so the bar sits `0.5rem` above the nav's top, and pad the end of the list by the bar's height so the last rows clear it. Update the measurement when the viewport changes. The bar is `position: fixed` and only exists while stacked and batching.

### One field group

Extract the bulk fields into one component used by the wide panel and the stacked dialog. Both call the existing `runBulkClassification`. Do not duplicate the type, category, member, or split controls. Keep the buttons outside that component: the labels differ (**Apply to N transactions** vs **Apply to selected**).

Key `CategoryCombobox` with a generation counter that increments when the bulk form is replaced wholesale (reset to `emptyBulkForm`, or a similar-merchants prefill). Do not key it on `isBulkModalOpen`. Typing in the field does not increment the counter. This is what stops a later batch from keeping the previous category (#129) once the dialog is no longer the thing that remounts the field.

### Form reset

Apply these in the handlers. Do not use one effect that treats every `0 → n` transition as "start empty"; that effect races `selectSimilarTransactions`.

- `toggleSelectedTransaction` adding the first mark (length was 0) sets `emptyBulkForm`. Further checks leave the form alone. Removing the last mark resets the form.
- `toggleAllVisible` from an empty selection starts from `emptyBulkForm`. `toggleAllVisible` while a batch is already in progress (length already ≥ 2) keeps the form. Clearing every mark resets the form.
- `selectSimilarTransactions` sets the matching visible ids and then sets the bulk form from the current single-row form. That prefill wins over the empty-start rule. On a wide layout it does not open the dialog. On a stacked layout it opens the dialog with that prefill.
- `selectImportForReview` clears marks and resets the bulk form.
- `applyQueueData` already filters `selectedIds` to the current page. If that filter leaves the list empty, reset the bulk form. If some marks remain, keep the form.
- **Clear marks** and a successful apply clear marks and reset the bulk form.
- Cancel on the dialog keeps today's behavior (`closeBulkClassification` resets the form and closes).

### Keyboard

Shortcuts keep working from the panel. While the bulk dialog or the shortcut help is open, they stay disabled, as today.

The key listener currently rebinds every render and sees fresh state. Keep it that way, or, if you add a dependency list, include `isBatching` and the bulk handlers so `⌘/Ctrl+Enter` cannot save the single-row form while a batch is showing.

| Key | Not batching | Batching |
| --- | --- | --- |
| `⌘/Ctrl+Enter` | Save the highlighted row | Apply the batch |
| `1`–`5` | Set the single-row type | Set the batch type |
| `C` | Focus the panel category field | Same, the batch category field |
| `R` | Toggle the merchant rule when eligible | Ignored |
| `S`, arrows, `?` | Unchanged | Unchanged |

Update the shortcut help line for `⌘/Ctrl+Enter` to: save this row, or apply to marked rows.

### Slice 1 files

- `src/components/expenses/review-queue-client.tsx`
- Review-only rules in `src/app/globals.css` for the batch dock, the panel column, and the batch panel state
- `tests/e2e/review-workflow.spec.ts`
- `tests/review/review-bulk-classification-form.test.ts`

### Slice 1 acceptance

- Click a row and save it from the panel. Checkboxes are not required.
- Check one row on a wide viewport and on a 960px viewport. The panel still saves that row only, shows the "check more rows" hint, and does not show **Classify selected**.
- Check two rows on a wide viewport. The panel heading is `2 transactions`. **Apply to 2 transactions** posts the existing bulk payload for those ids. **Clear marks** restores the single-row panel and does not post.
- There is no **Classify selected** button on a wide viewport.
- On a 960px-wide viewport, two marked rows show the bottom bar above the tab bar, the panel still says saving here classifies this row only, and **Classify selected** opens the dialog.
- `⌘/Ctrl+Enter` with two marks posts the bulk payload, not the single-row endpoint.
- Similar merchants on a wide viewport prefills the panel and does not open the dialog. On a 960px viewport it opens the dialog with that prefill.
- A new batch does not reuse the previous batch's category.
- Undo still restores a bulk classification.
- Import, History, and Reports still scroll as a document.

## Slice 2 — The table scrolls, the panel stays

Start only after slice 1 is in use. Wide layouts only. Stacked layouts keep document scroll.

### Structure

Inside `.review-workspace`, this order:

1. Scope card (progress, statement switcher). Natural height. Outside the board, so opening **Switch statement** changes the board's top.
2. Board (`.review-board`):
   - Toolbar (filters) and status span the full width.
   - Left: the queue (`.review-list`).
   - Right: the classify panel from slice 1.

```css
.review-board {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(22rem, 0.95fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas:
    "toolbar toolbar"
    "status status"
    "list detail";
  min-width: 0;
  overflow: visible;
}

.review-list,
.review-detail {
  min-width: 0;
  min-height: 0;
}
```

`.review-workspace` stays `overflow: visible`. The filter menu is `position: absolute` under the toolbar. Give the toolbar a `z-index` above the list so that menu paints over the table. Do not put `overflow` other than `visible` on the board or the workspace.

List column, top to bottom:

- **Mark all** prompt, natural height, outside the scroller. Hidden while batching, same as slice 1.
- `.review-table-wrap`, the only vertical scroller in the list.
- Pagination, natural height, outside the scroller.

`min-height: 0` on the table wrapper is not enough. The grid row, `.review-list`, and `.review-detail` need it too. Without that, the row's `min-height: auto` grows to fit all 50 rows, the inner scroller never starts, and the page scrolls.

### Height

The board is the only height-limited region. Fit it to `.app-main-scroll`, the element that actually scrolls.

```text
scrollport = board.closest(".app-main-scroll")
top = boardTop - scrollportTop + scrollport.scrollTop
trailing = scrollport padding-bottom + .page-shell padding-bottom
available = scrollport.clientHeight - top - trailing
```

Read both paddings from computed style each time. Do not hardcode `4rem`, `8rem`, or `5.6rem`. `top` includes `scrollTop` so a scrolled page does not inflate the board. `top` does not depend on the board's own height.

At `max-width: 1024px` the scrollport's `8rem` padding-bottom is what clears the fixed tab bar. Subtract that padding once. Do not also subtract a magic nav offset. If a later shell change makes the nav overlap the board after that padding is subtracted, subtract only the remaining overlap (`scrollport` bottom minus `.app-mobile-nav` top, when the nav is displayed).

Set the board's height to `available` only while the lock is on. After setting it, if the scrollport still overflows by more than 1px, subtract that overflow once on the next frame. Do not loop.

Update the measurement when the window resizes and when something above the board changes height: the scope card, the Transactions header (`[data-testid="transactions-shell"]`), and the workflow nav. The review badge inside that nav loads in `Suspense` and can change the nav's height. A `ResizeObserver` on those elements is the signal. The desktop filter menu is absolutely positioned, so it does not move the board. Filter chips sit inside the toolbar row; `minmax(0, 1fr)` absorbs them. Do not remeasure the board for the filter disclosure.

Do not set a fixed `100dvh` on `.app-shell`, `.page-shell`, or `.app-main-scroll`. Do not edit those classes. Do not change `overflow-x` on `.app-main-scroll`.

Hysteresis, so a resize around the threshold does not flicker:

- Lock turns on when it is off and `available` is at least `18rem`.
- Lock turns off when it is on and `available` is under `16rem`.

While locked, add a class on `.review-workspace` and:

- The board uses the measured height.
- `.review-toolbar` is `position: static` (it is in the board, not stuck to the page).
- `.review-detail` is stretched: `position: static`, `max-height: none`, `height: 100%`. The slice 1 body/footer split stays.
- `.review-table-wrap` is `flex: 1 1 auto`, `min-height: 0`, `overflow: auto`, `overscroll-behavior: contain`, with `scroll-padding-top` at least the sticky header height.

While unlocked, do not set a board height. Slice 1's sticky panel (`top: 9rem`, `max-height: calc(100vh - 10rem)`) stays in force. This is the short-window fallback that `min-height: 26rem` could not do.

### Table scroller

Header cells of `.review-table` stick to the top of `.review-table-wrap`. Override collapse on this table only:

```css
.review-table {
  border-collapse: separate;
  border-spacing: 0;
}

.review-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface-strong);
}
```

Do not change shared `.data-table`. Sticky headers fail under `border-collapse: collapse`. The header background has to be opaque so rows do not show through.

`.review-table` stays `min-width: 52rem`, so the same wrapper scrolls horizontally when the column is narrower than the table. That is expected. `overscroll-behavior: contain` keeps a flick at the end of the list from moving the page.

Row focus uses `element.focus({ preventScroll: true })`, then sets `.review-table-wrap.scrollTop` so the row is visible inside that wrapper. Do not call `scrollIntoView`. It scrolls every ancestor, including `.app-main-scroll`. `focusReviewRow` today calls `focus()` without `preventScroll`; this slice changes that.

### Stacked

At `960px` and below, the lock stays off. The board is normal flow. Do not set `overflow-y: auto` on `.review-table-wrap`. Leave `.table-wrap`'s horizontal scroll, and leave the `640px` card rules, as they are today. The slice 1 bottom bar remains.

### Slice 2 files

- `src/components/expenses/review-queue-client.tsx` for the board measurement, the lock class, and row scrolling
- Review-scoped rules in `src/app/globals.css`

Do not edit `.app-shell`, `.app-main`, `.app-main-scroll`, `.page-shell`, or shared table classes. Do not change `overflow-x` on `.app-main-scroll`.

### Slice 2 acceptance

- On a desktop window with a full page of remaining rows, Import / Review / History stays fully visible. Scrolling the queue does not move the panel, and `.app-main-scroll` does not move.
- Computed overflow of `.app-shell` stays `visible`. Computed `overflow-x` of `.app-main-scroll` stays `hidden`.
- The table shows as many rows as fit. It is not forced to one row and not forced to ten. Pagination is visible without scrolling the rows.
- Opening **Switch statement** shrinks the board instead of pushing the header off screen.
- A short window (available height under `16rem` while locked, or under `18rem` before locking) falls back to page scroll, and the panel uses the slice 1 sticky rules.
- The classify form shows treatment, category, and **Save and next** without a page scrollbar when those fit. Taller forms scroll inside `.review-detail-body`, with the save action still visible and not covering the fields.
- A `980×800` window keeps the two columns, keeps the inline batch panel, and does not draw the board under the tab bar.
- Slice 1 batch behavior still holds.
- A 960px viewport stacks and scrolls as one page. From 641px to 960px the wide table can still scroll horizontally. At 390px the existing card layout still fits the viewport.
- History, Import, Reports, and Settings still grow the page scrollport. Their tables are not height-locked.

## Slice 3 — Denser Review header

Do this after slice 2. It is part of the workspace, not a shared chrome restyle.

On every Transactions tab (Import, Review, History), put the Transactions title and the Import / Review / History nav on one row. The header is the same size and position on all three tabs, so switching tabs never moves the nav. The eyebrow and the page description are removed.

A Review-only header made the nav jump about 190px every time someone entered or left Review, so the compact header is shared chrome for the Transactions layout.

Implement that in a client frame used by `src/app/(app)/transactions/layout.tsx`. It always sets `transactions-shell`, and adds `transactions-review-shell` only when `usePathname() === "/transactions/review"`. The Review class carries only Review workspace rules (bottom padding for the board lock), never header styling.

Do not do this with `.page-shell:has(.review-workspace)`. Do not change `.page-shell` width or overflow.

After the one-row header, slice 2's measurement already includes the Transactions header. No second height formula.

### Slice 3 files

- `src/app/(app)/transactions/layout.tsx`
- A client header next to `src/components/transactions/transactions-workflow-nav.tsx`
- Review-scoped rules in `src/app/globals.css`, keyed by a class the header sets only on the Review route

### Slice 3 acceptance

- On Import, Review, and History, the title and Import / Review / History sit on one row.
- Switching between the three tabs does not move or resize the title or the nav.
- Slice 2's lock still clears the header. A short window still falls back to page scroll.
- History and Reports still scroll as a document.

## Out of scope

- Changing page size, filters, suggestions, merchant rules, or classification rules.
- A new batch API.
- Sticky or inner-scroll behavior on History or any other table.
- Restyling the app sidebar or mobile tab bar.
- Widening `.page-shell` past `1120px`.

## Done when

Slices 1, 2, and 3 meet the acceptance lists above. After slice 2, History and one other non-Review table page (Reports or Settings) still scroll as a document, and `.app-main-scroll` still has `overflow-x: hidden`.
