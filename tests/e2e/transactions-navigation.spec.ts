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
    summary: {
      queueCount: number;
      completionPercentage: number;
      remainingByImport: Array<{
        importId: string;
        originalFilename: string;
        remainingCount: number;
      }>;
      statementLibrary: Array<{
        importId: string;
        originalFilename: string;
        remainingCount: number;
      }>;
    };
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

test("review and history focus links use canonical routes", async ({ page }) => {
  const snapshot = await reviewSnapshot(page);
  const transaction = snapshot.queue[0];
  test.skip(!transaction, "The focus-link assertion needs a transaction.");
  const month = transaction!.transactionDate.slice(0, 7);

  await page.goto(`/transactions/review?transactionId=${transaction!.id}`);
  await expect(page.getByRole("link", { name: "Open in History" })).toHaveAttribute(
    "href",
    `/transactions/all?transactionId=${transaction!.id}&month=${month}`,
  );

  await page.goto(`/transactions/all?transactionId=${transaction!.id}`);
  await expect.poll(() => Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({
    transactionId: transaction!.id,
    month,
  });
  await expect(page.locator("tr.table-row-active")).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Review .* left|Open review queue/ }).first())
    .toHaveAttribute("href", /\/transactions\/review/);
});

test("workflow History tab keeps the all-transactions URL", async ({ page }) => {
  await page.goto("/transactions");
  const history = page.getByRole("navigation", { name: "Transactions workflow" })
    .getByRole("link", { name: "History", exact: true });
  await expect(history).toHaveAttribute("href", "/transactions/all");
  await expect(
    page.getByRole("navigation", { name: "Transactions workflow" })
      .getByRole("link", { name: "All transactions", exact: true }),
  ).toHaveCount(0);
});

test("bare Review opens the latest incomplete statement", async ({ page }) => {
  const snapshot = await reviewSnapshot(page);
  const latest = snapshot.summary.remainingByImport[0];
  test.skip(!latest, "The default Review landing needs an incomplete statement.");

  await page.goto("/transactions/review");
  await expect.poll(() => new URL(page.url()).searchParams.get("import")).toBe(latest.importId);
  await expect(page.getByRole("heading", { name: latest.originalFilename })).toBeVisible();
  await expect(page.getByRole("heading", { name: "All imported statements" })).toHaveCount(0);
});

test("explicit Review import=all keeps remaining work and does not auto-pick a statement", async ({ page }) => {
  const snapshot = await reviewSnapshot(page);
  test.skip(snapshot.summary.queueCount === 0, "The all-remaining assertion needs a non-empty queue.");

  await page.goto("/transactions/review?import=all");
  await expect.poll(() => new URL(page.url()).searchParams.get("import")).toBe("all");
  await expect(page.getByRole("progressbar", { name: /review progress/i })).toHaveCount(0);
  await expect(page.getByText(`${snapshot.summary.queueCount} remaining across`)).toBeVisible();
});

test("Review month scope does not auto-pick a statement", async ({ page }) => {
  const snapshot = await reviewSnapshot(page);
  const transaction = snapshot.queue[0];
  test.skip(!transaction, "The month-scope assertion needs a queued transaction.");
  const month = transaction!.transactionDate.slice(0, 7);

  await page.goto(`/transactions/review?month=${month}`);
  await expect.poll(() => Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({
    month,
  });
  expect(new URL(page.url()).searchParams.get("import")).toBeNull();
});

test("Review statement switcher includes complete files without a five-item cap", async ({ page }) => {
  const snapshot = await reviewSnapshot(page);
  const library = snapshot.summary.statementLibrary ?? [];
  test.skip(library.length === 0, "The switcher assertion needs saved statements.");

  await page.goto("/transactions/review?import=all");
  await page.getByText("Switch statement").click();
  await expect(page.getByRole("button", { name: "All remaining" })).toBeVisible();
  const complete = library.filter((item) => item.remainingCount === 0);
  if (complete[0]) {
    await expect(page.getByRole("button", { name: new RegExp(complete[0].originalFilename) }).first())
      .toBeVisible();
    await expect(page.getByText("Complete", { exact: true }).first()).toBeVisible();
  }
  if (library.length > 5) {
    await expect(page.getByRole("button", { name: /left|statement complete/i })).toHaveCount(library.length);
  }
});

test("Clear all filters restores the latest incomplete statement", async ({ page }) => {
  const snapshot = await reviewSnapshot(page);
  const latest = snapshot.summary.remainingByImport[0];
  test.skip(!latest, "Clear-all needs an incomplete statement.");

  await page.goto("/transactions/review?import=all");
  await expect(page.getByRole("button", { name: "Clear all filters" })).toBeVisible();
  await page.getByRole("button", { name: "Clear all filters" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("import")).toBe(latest.importId);
  expect(new URL(page.url()).searchParams.get("import")).not.toBe("all");
});

test("bare History opens the latest activity month", async ({ page }) => {
  const snapshot = await reviewSnapshot(page);
  test.skip(snapshot.queue.length === 0 && snapshot.summary.queueCount === 0, "History landing needs financial activity.");

  await page.goto("/transactions/all");
  await expect.poll(() => new URL(page.url()).searchParams.get("month")).toMatch(/^\d{4}-\d{2}$/);
  expect(new URL(page.url()).searchParams.get("month")).not.toBe("all");
});

test("explicit History month=all stays paginated and is not the landing default", async ({ page }) => {
  await page.goto("/transactions/all?month=all");
  await expect.poll(() => new URL(page.url()).searchParams.get("month")).toBe("all");
  const scoped = await page.request.get("/api/expenses?month=all&pageSize=50");
  const landing = await page.request.get("/api/expenses");
  expect(scoped.ok()).toBeTruthy();
  expect(landing.ok()).toBeTruthy();
  const scopedBody = await scoped.json() as { transactions: unknown[]; pagination: { pageSize: number; filteredCount: number } };
  const landingBody = await landing.json() as { query: { month: string }; transactions: unknown[]; pagination: { pageSize: number } };
  expect(scopedBody.pagination.pageSize).toBeLessThanOrEqual(50);
  expect(landingBody.query.month).toMatch(/^\d{4}-\d{2}$/);
  expect(landingBody.transactions.length).toBeLessThanOrEqual(50);
  if (scopedBody.pagination.filteredCount > 50) {
    expect(landingBody.transactions.length).toBeLessThan(scopedBody.pagination.filteredCount);
  }
});

test("History import scope keeps the statement across its activity months", async ({ page }) => {
  const snapshot = await reviewSnapshot(page);
  const importId = snapshot.queue[0]?.importId ?? snapshot.summary.remainingByImport[0]?.importId;
  test.skip(!importId, "The statement History assertion needs a saved import.");

  await page.goto(`/transactions/all?import=${importId}`);
  await expect.poll(() => new URL(page.url()).searchParams.get("import")).toBe(importId);
  expect(new URL(page.url()).searchParams.get("month")).toBeNull();
});
