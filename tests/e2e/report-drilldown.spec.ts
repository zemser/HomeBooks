import { expect, test, type APIRequestContext } from "@playwright/test";

const month = "2023-08";
let memberId: string;
let memberName: string;
let categoryId: string;
const createdIds: string[] = [];

async function create(request: APIRequestContext, title: string, classificationType: string, amount: number, category: string | null) {
  const response = await request.post("/api/manual-entries", { data: {
    title, classificationType, amount, categoryId: category,
    eventKind: classificationType === "income" ? "income" : "expense",
    eventDate: `${month}-15`,
    personalOwnerMemberId: classificationType === "personal" ? memberId : undefined,
    receivedByMemberId: classificationType === "income" ? memberId : undefined,
    payerMemberId: classificationType === "income" ? undefined : memberId,
  } });
  expect(response.status(), await response.text()).toBe(201);
  const { manualEntryId } = await response.json();
  createdIds.push(manualEntryId);
  return manualEntryId as string;
}

test.beforeAll(async ({ request }) => {
  const memberResponse = await request.get("/api/workspace-members");
  const { members } = await memberResponse.json();
  const member = members.find((entry: { isActive: boolean }) => entry.isActive);
  memberId = member.id;
  memberName = member.displayName;
  const categoryResponse = await request.get("/api/workspace-categories");
  const { categories } = await categoryResponse.json();
  categoryId = categories.find((entry: { name: string }) => entry.name === "Housing").id;
  await create(request, "Drilldown personal housing", "personal", 100, categoryId);
  const shared = await create(request, "Drilldown shared housing", "shared", 600, categoryId);
  await create(request, "Drilldown housing income", "income", 1000, categoryId);
  await create(request, "Drilldown uncategorized spending", "shared", 25, null);
  await create(request, "Drilldown uncategorized income", "income", 50, null);
  const allocated = await request.post("/api/transaction-allocations", { data: {
    sourceType: "manual", sourceId: shared, reportingMode: "allocated_period", allocationStrategy: "manual_split",
    allocations: [{ reportMonth: "2023-06-01", allocatedAmount: "300" }, { reportMonth: "2023-08-01", allocatedAmount: "300" }],
  } });
  expect(allocated.status(), await allocated.text()).toBe(200);
});

test.afterAll(async ({ request }) => {
  for (const id of createdIds) expect((await request.delete(`/api/manual-entries/${id}`)).status()).toBe(200);
});

for (const mobile of [false, true]) test.describe(mobile ? "mobile" : "desktop", () => {
  test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
  test("slices filter instantly, survive reload, and keep predictable keyboard focus", async ({ page }) => {
    await page.goto(`/reports?view=month&month=${month}&mode=payment_date`);
    const heading = page.locator("#line-items");
    const list = page.getByRole("region", { name: /Included line items/ });
    const personal = page.getByRole("button", { name: new RegExp(`Personal · ${memberName} ·`) });
    await expect(personal).toBeVisible();
    const reportRequests: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/reports?") && request.url().includes("_rsc=")) reportRequests.push(request.url()); });
    await personal.focus();
    await personal.press("Enter");
    await expect(heading).toBeFocused();
    await expect(personal).toHaveAttribute("aria-pressed", "true");
    await expect(list).toContainText("Drilldown personal housing");
    await expect(list).not.toContainText("Drilldown shared housing");
    await expect(page).toHaveURL(new RegExp(`kind=personal&member=${memberId}`));
    expect(reportRequests).toEqual([]);
    await page.reload();
    await expect(list).toContainText("Drilldown personal housing");
    await expect(personal).toHaveAttribute("aria-pressed", "true");
    // A refreshed deep link has no origin.
    await page.getByRole("button", { name: "Back to summary" }).click();
    await expect(page.locator("#report-summary")).toBeFocused();
    const matrix = page.locator(mobile ? ".scope-category-cards" : ".scope-matrix-table");
    const sharedHousing = matrix.getByRole("button", { name: "Housing · Shared", exact: true });
    await sharedHousing.click();
    await expect(heading).toHaveText("Included line items · Housing · Shared");
    await expect(list).toContainText("1 item · 600.00 ILS");
    await expect(list).not.toContainText("Drilldown housing income");
    await page.getByRole("button", { name: "Clear Housing · Shared filter" }).click();
    await expect(heading).toBeFocused();
    await expect(list).toContainText("Drilldown housing income");
    await page.getByRole("button", { name: "Back to summary" }).click();
    await expect(sharedHousing).toBeFocused();
    await sharedHousing.press("Space");
    await expect(heading).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(heading).toBeFocused();
    await expect(heading).toHaveText("Included line items · All items");
    await sharedHousing.click();
    await page.getByRole("button", { name: "Back to summary" }).click();
    await sharedHousing.press("Enter");
    await expect(sharedHousing).toBeFocused();
    await expect(sharedHousing).toHaveAttribute("aria-pressed", "false");
    await expect(heading).toHaveText("Included line items · All items");
    await expect(page.getByRole("button", { name: /Saved/ })).toHaveCount(0);
  });

  test("Home category links exclude income and deep links retain context", async ({ page }) => {
    for (const category of ["Housing", "Uncategorized"]) {
      await page.goto(`/?month=${month}`);
      const link = page.locator(".home-category-link").filter({ hasText: category });
      await expect(link).toHaveAttribute("href", /kind=expense&category=.*#line-items$/);
      await link.click();
      const list = page.getByRole("region", { name: /Included line items/ });
      await expect(page.locator("#line-items")).toHaveText(`Included line items · ${category}`);
      await expect(list).toContainText("August 2023 · Payment date");
      await expect(list).not.toContainText("Drilldown housing income");
      await expect(list).not.toContainText("Drilldown uncategorized income");
      await page.getByRole("button", { name: "Back to summary" }).click();
      await expect(page.locator("#report-summary")).toBeFocused();
    }
  });
});

test("invalid slices stay unavailable on refresh; category-only links become canonical", async ({ page }) => {
  await page.goto(`/reports?view=month&month=${month}&mode=payment_date&kind=shared&member=${memberId}#line-items`);
  const list = page.getByRole("region", { name: /Included line items/ });
  await expect(list).toContainText("This filter is no longer available");
  await expect(list.locator("tbody tr")).toHaveCount(0);
  await page.reload();
  await expect(list).toContainText("This filter is no longer available");
  await expect(page).toHaveURL(new RegExp(`kind=shared&member=${memberId}`));
  await page.getByRole("button", { name: "Show all items" }).click();
  await expect(page.locator("#line-items")).toBeFocused();
  await expect(list).toContainText("Drilldown housing income");
  await expect(page).not.toHaveURL(/kind=|member=/);
  await page.goto(`/reports?month=${month}&category=${categoryId}#line-items`);
  await expect(page).toHaveURL(/kind=expense/);
  await expect(list).not.toContainText("Drilldown housing income");
});

test("month and mode preserve empty slices; allocations expose full source details", async ({ page }) => {
  await page.goto(`/reports?view=month&month=${month}&mode=payment_date&kind=shared&category=${categoryId}#line-items`);
  await page.getByLabel("Selected month").fill("2023-06");
  await page.getByRole("button", { name: "Load report", exact: true }).click();
  const list = page.getByRole("region", { name: /Included line items/ });
  await expect(list).toContainText("No items in this slice");
  await expect(list).toContainText("0 items · 0.00 ILS");
  await expect(page).toHaveURL(new RegExp(`kind=shared&category=${categoryId}`));
  await page.getByText("Advanced reporting and FX", { exact: true }).click();
  await page.getByRole("combobox", { name: "Reporting mode", exact: true }).selectOption("allocated_period");
  await page.getByRole("button", { name: "Apply mode" }).click();
  await expect(list).toContainText("Drilldown shared housing");
  await expect(list).toContainText("1 item · 300.00 ILS");
  await expect(list).toContainText("Source payment/event date: 2023-08-15");
  await expect(list).toContainText("Full source amount: 600.00 ILS");
  await expect(list.getByRole("columnheader", { name: "Included this month" })).toBeVisible();
  await expect(list.getByRole("link", { name: "Open in History" })).toHaveCount(0);
  await page.goBack();
  await expect(list).toContainText("No items in this slice");
  await page.goBack();
  await expect(list).toContainText("1 item · 600.00 ILS");
  await page.getByRole("navigation", { name: "Report view" }).getByRole("link", { name: "Year", exact: true }).click();
  await expect(page).not.toHaveURL(/kind=|category=/);
  await page.getByRole("link", { name: "August 2023", exact: true }).click();
  await expect(page).not.toHaveURL(/kind=|category=/);
});

test("an imported June allocation opens its August source in History", async ({ page }) => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires the local test database for an isolated imported fixture.");
  const { default: pg } = await import("pg");
  const { randomUUID } = await import("node:crypto");
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  const accountId = randomUUID();
  const importId = randomUUID();
  const transactionId = randomUUID();
  const pendingId = randomUUID();
  const eventId = randomUUID();
  try {
    const { rows: [member] } = await db.query("select workspace_id, user_id from workspace_members where id = $1", [memberId]);
    expect(member).toBeTruthy();
    await db.query("begin");
    await db.query("insert into financial_accounts (id, workspace_id, account_type, display_name) values ($1, $2, 'bank', 'Drilldown fixture')", [accountId, member.workspace_id]);
    await db.query("insert into imports (id, workspace_id, uploaded_by_user_id, type, file_kind, original_filename, storage_path, file_checksum, import_status) values ($1, $2, $3, 'bank', 'csv', 'drilldown.csv', 'test', $4, 'completed')", [importId, member.workspace_id, member.user_id, importId]);
    for (const [id, date, amount] of [[transactionId, "2023-08-15", "600"], [pendingId, "2023-06-15", "10"]]) {
      await db.query("insert into transactions (id, workspace_id, account_id, import_id, transaction_date, description, original_currency, original_amount, workspace_currency, normalized_amount, direction, dedupe_hash) values ($1, $2, $3, $4, $5, 'Drilldown imported bill', 'ILS', $6, 'ILS', $6, 'debit', $7)", [id, member.workspace_id, accountId, importId, date, amount, id]);
    }
    await db.query("insert into transaction_classifications (transaction_id, classification_type, category_id, category, paid_by_member_id, decided_by) values ($1, 'shared', $2, 'Housing', $3, 'user')", [transactionId, categoryId, memberId]);
    await db.query("insert into expense_events (id, workspace_id, source_type, source_id, event_kind, title, total_amount, workspace_currency, classification_type, category_id, category, reporting_mode) values ($1, $2, 'transaction', $3, 'expense', 'Drilldown imported bill', 600, 'ILS', 'shared', $4, 'Housing', 'allocated_period')", [eventId, member.workspace_id, transactionId, categoryId]);
    await db.query("insert into expense_allocations (expense_event_id, report_month, allocated_amount, allocation_method) values ($1, '2023-06-01', 300, 'manual_split'), ($1, '2023-08-01', 300, 'manual_split')", [eventId]);
    await db.query("commit");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/reports?view=month&month=2023-06&mode=allocated_period&kind=shared&category=${categoryId}#line-items`);
    const list = page.getByRole("region", { name: /Included line items/ });
    await expect(list).toContainText("June 2023 · Adjusted period");
    await expect(list).toContainText("Totals are based on reviewed transactions.");
    const row = list.getByRole("row").filter({ hasText: "Drilldown imported bill" });
    await expect(row).toContainText("Full source amount: 600.00 ILS");
    await expect(row).toContainText("Source payment/event date: 2023-08-15");
    await expect(row).toContainText("300.00 ILS");
    const history = row.getByRole("link", { name: "Open in History" });
    await expect(history).toHaveAttribute("href", `/transactions/all?transactionId=${transactionId}&month=2023-08`);
    await history.click();
    await expect(page).toHaveURL(new RegExp(`transactionId=${transactionId}&month=2023-08`));
    const selectedRow = page.locator("tr.table-row-active");
    await expect(selectedRow).toBeVisible();
    await expect(selectedRow).toContainText("Drilldown imported bill");
    await expect(selectedRow).toContainText("2023-08-15");
  } finally {
    await db.query("rollback");
    await db.query("delete from expense_allocations where expense_event_id = $1", [eventId]);
    await db.query("delete from expense_events where id = $1", [eventId]);
    await db.query("delete from transaction_classifications where transaction_id = $1", [transactionId]);
    await db.query("delete from transactions where import_id = $1", [importId]);
    await db.query("delete from imports where id = $1", [importId]);
    await db.query("delete from financial_accounts where id = $1", [accountId]);
    await db.end();
  }
});
