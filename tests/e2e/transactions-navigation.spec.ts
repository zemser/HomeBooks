import { expect, test, type Page } from "@playwright/test";

async function reviewSnapshot(page: Page) {
  const response = await page.request.get("/api/imports/review?page=1&pageSize=100");
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{
    queue: Array<{
      id: string;
      importId: string;
      transactionDate: string;
      normalizedAmount: string;
    }>;
    summary: { queueCount: number };
  }>;
}

test("desktop navigation exposes the Phase 4 information architecture", async ({ page }) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Primary application" });
  const money = navigation.locator(".app-nav-section").filter({ hasText: "Money" });
  const more = navigation.locator(".app-nav-section").filter({ hasText: "More" });

  await expect(money.getByRole("link")).toHaveCount(3);
  await expect(money.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(money.getByRole("link", { name: /Transactions/ })).toBeVisible();
  await expect(money.getByRole("link", { name: "Reports", exact: true })).toBeVisible();
  await expect(more.getByRole("link")).toHaveCount(4);
  await expect(more.getByRole("link", { name: "Recurring", exact: true })).toBeVisible();
  await expect(more.getByRole("link", { name: "Settlements", exact: true })).toBeVisible();
  await expect(more.getByRole("link", { name: /Investments.*Beta/ })).toBeVisible();
  await expect(more.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Imports", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Review", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Expenses", exact: true })).toHaveCount(0);
});

test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("has exactly four destinations and no secondary header pills", async ({ page }) => {
    await page.goto("/transactions");
    const navigation = page.getByRole("navigation", { name: "Primary mobile navigation" });

    await expect(navigation.getByRole("link")).toHaveCount(4);
    await expect(navigation.getByRole("link", { name: "Home", exact: true })).toBeVisible();
    await expect(navigation.getByRole("link", { name: /Transactions/ })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Reports", exact: true })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "More", exact: true })).toBeVisible();
    await expect(page.locator(".app-mobile-actions, .mobile-pill-link")).toHaveCount(0);
  });

  for (const [route, title] of [
    ["/more", "More"],
    ["/recurring", "Recurring"],
    ["/settlements", "Settlements"],
    ["/investments", "Investments"],
    ["/settings", "Settings"],
  ] as const) {
    test(`More is active on ${route}`, async ({ page }) => {
      await page.goto(route);
      const more = page.getByRole("navigation", { name: "Primary mobile navigation" })
        .getByRole("link", { name: "More", exact: true });

      await expect(more).toHaveAttribute("aria-current", "page");
      await expect(page.locator(".app-mobile-header").getByRole("heading", { name: title })).toBeVisible();
    });
  }

  for (const route of ["/transactions", "/transactions/review", "/transactions/all"] as const) {
    test(`Transactions is active on ${route}`, async ({ page }) => {
      await page.goto(route);
      const transactions = page.getByRole("navigation", { name: "Primary mobile navigation" })
        .getByRole("link", { name: /Transactions/ });

      await expect(transactions).toHaveAttribute("aria-current", "page");
    });
  }
});

test("Transactions and Review show the pending-review count", async ({ page }) => {
  const snapshot = await reviewSnapshot(page);
  test.skip(snapshot.summary.queueCount === 0, "The pending-count assertion needs a non-empty queue.");

  await page.goto("/transactions/review");
  const label = `${snapshot.summary.queueCount} transactions pending review`;
  await expect(
    page.getByRole("navigation", { name: "Primary application" })
      .getByRole("link", { name: /Transactions/ })
      .getByLabel(label),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Transactions workflow" })
      .getByRole("link", { name: /Review/ })
      .getByLabel(label),
  ).toBeVisible();
});

test("canonical review deep links retain filters and restore review state", async ({ page }) => {
  const snapshot = await reviewSnapshot(page);
  const highValueGroups = new Map<string, typeof snapshot.queue>();
  for (const item of snapshot.queue) {
    if (Math.abs(Number(item.normalizedAmount)) < 500) continue;
    const key = `${item.importId}:${item.transactionDate.slice(0, 7)}`;
    highValueGroups.set(key, [...(highValueGroups.get(key) ?? []), item]);
  }
  const candidates = [...highValueGroups.values()].find((items) => items.length >= 2);
  test.skip(!candidates, "The deep-link assertion needs two high-value rows in one statement month.");
  const transaction = candidates![1];
  const month = transaction.transactionDate.slice(0, 7);
  const params = new URLSearchParams({
    import: transaction.importId,
    month,
    transactionId: transaction.id,
    view: "high_value",
    page: "2",
    pageSize: "1",
  });

  await page.goto(`/transactions/review?${params.toString()}`);
  await expect(page.getByRole("button", { name: "High value" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Month")).toHaveValue(month);
  await expect.poll(() => Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject(
    Object.fromEntries(params),
  );
  await expect(page).toHaveURL(/\/transactions\/review\?/);
});

test("review and all-transactions focus links use canonical routes", async ({ page }) => {
  const snapshot = await reviewSnapshot(page);
  const transaction = snapshot.queue[0];
  test.skip(!transaction, "The focus-link assertion needs a transaction.");

  await page.goto(`/transactions/review?transactionId=${transaction!.id}`);
  await expect(page.getByRole("link", { name: "Open in ledger" })).toHaveAttribute(
    "href",
    `/transactions/all?transactionId=${transaction!.id}`,
  );

  await page.goto(`/transactions/all?transactionId=${transaction!.id}`);
  await expect(page).toHaveURL(`/transactions/all?transactionId=${transaction!.id}`);
  await expect(page.locator("tr.table-row-active")).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Review .* left|Open review queue/ }).first())
    .toHaveAttribute("href", "/transactions/review");
});
