import { expect, test, type Page } from "@playwright/test";

type ReviewResponse = {
  queue: Array<{
    id: string;
    merchantRaw: string | null;
    accountOwnerMemberId: string | null;
  }>;
  categoryCatalog: Array<{
    id: string;
    name: string;
  }>;
  members: Array<{
    id: string;
    displayName: string;
  }>;
  summary: {
    queueCount: number;
  };
};

function duplicateMerchantGroup(queue: ReviewResponse["queue"]) {
  const groups = new Map<string, ReviewResponse["queue"]>();
  for (const row of queue) {
    const merchant = row.merchantRaw?.trim().toLocaleLowerCase();
    if (!merchant) continue;
    const list = groups.get(merchant) ?? [];
    list.push(row);
    groups.set(merchant, list);
  }
  return [...groups.values()].find((rows) => rows.length >= 2) ?? null;
}

async function loadReviewData(page: Page) {
  const response = await page.request.get("/api/imports/review?page=1&pageSize=50");
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<ReviewResponse>;
}

test.describe("transaction review workflow", () => {
  test("filters survive reload and Clear all returns to the default queue", async ({ page }) => {
    const initial = await loadReviewData(page);
    const merchant = initial.queue.find((item) => item.merchantRaw?.trim())?.merchantRaw?.trim();
    test.skip(!merchant, "The seeded review queue has no searchable merchant.");

    await page.goto("/transactions/review");
    await expect(page.getByRole("heading", { name: "Transactions", exact: true })).toBeVisible();

    const search = page.getByRole("searchbox", { name: "Search" });
    await search.fill(merchant!);
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(merchant!);
    await expect(page.getByRole("button", { name: "Clear all filters" })).toBeVisible();

    await page.reload();
    await expect(search).toHaveValue(merchant!);
    await page.getByRole("button", { name: "Clear all filters" }).click();
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(search).toHaveValue("");
  });

  test("filter panel closes on outside click and Escape", async ({ page }) => {
    await page.goto("/transactions/review");
    await expect(page.getByRole("heading", { name: "Transactions", exact: true })).toBeVisible();

    const filters = page.locator("details.review-filter-disclosure");
    const trigger = filters.locator(":scope > summary");
    await trigger.click();
    await expect(filters).toHaveAttribute("open", "");

    const controlHeights = await Promise.all([
      filters.locator(".import-scope-picker > summary").evaluate((element) => element.getBoundingClientRect().height),
      filters.getByLabel("Month").evaluate((element) => element.getBoundingClientRect().height),
      filters.getByLabel("Account").evaluate((element) => element.getBoundingClientRect().height),
      filters.getByLabel("Sort").evaluate((element) => element.getBoundingClientRect().height),
    ]);
    expect(new Set(controlHeights).size).toBe(1);

    await page.getByRole("searchbox", { name: "Search" }).click();
    await expect(filters).not.toHaveAttribute("open", "");

    await trigger.click();
    await expect(filters).toHaveAttribute("open", "");
    await page.keyboard.press("Escape");
    await expect(filters).not.toHaveAttribute("open", "");
    await expect(trigger).toBeFocused();
  });

  test("review table does not reserve a column for suggestions", async ({ page }) => {
    await page.goto("/transactions/review");
    await expect(page.getByRole("heading", { name: "Transactions", exact: true })).toBeVisible();

    await expect(page.getByRole("columnheader", { name: "Suggestion" })).toHaveCount(0);
    await expect(page.locator('.review-table td[data-label="Suggestion"]')).toHaveCount(0);
  });

  test("checking a row reviews that same row in the panel", async ({ page }) => {
    const before = await loadReviewData(page);
    test.skip(before.queue.length < 2, "The checkbox focus test needs two review rows.");

    await page.goto("/transactions/review");
    const firstId = before.queue[0]!.id;
    const secondId = before.queue[1]!.id;
    const currentRow = page.locator('[data-review-transaction-id][aria-current="true"]');
    await expect(currentRow).toHaveAttribute("data-review-transaction-id", firstId);

    const secondRow = page.locator(`[data-review-transaction-id="${secondId}"]`);
    await secondRow.getByRole("checkbox").check();
    await expect(currentRow).toHaveAttribute("data-review-transaction-id", secondId);
    await expect(secondRow).toHaveClass(/table-row-active/);
    await expect(secondRow).toHaveClass(/table-row-checked/);

    const merchant = (await secondRow.locator('td[data-label="Merchant"] strong').innerText()).trim();
    const panel = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "This transaction" }),
    });
    await expect(panel.getByText(merchant, { exact: true }).first()).toBeVisible();
    await expect(panel.getByText("Check more rows to classify them together in this panel.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Classify selected", exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: /Save and next|Save classification/ })).toBeVisible();
  });

  test("review form infers payer from the account and only asks whose personal expense", async ({ page }) => {
    const before = await loadReviewData(page);
    test.skip(before.queue.length === 0, "The member-control test needs a review row.");

    await page.goto("/transactions/review");
    const panel = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "This transaction" }),
    });
    await expect(panel).toBeVisible();
    const hasAccountOwner = Boolean(before.queue[0]?.accountOwnerMemberId);

    await panel.getByRole("radio", { name: /Personal/ }).check();
    await expect(panel.getByRole("radio", { name: /Personal/ })).toBeChecked();
    await expect(panel.getByLabel("Whose personal expense?")).toBeVisible();
    await expect(panel.getByLabel("Paid by")).toHaveCount(hasAccountOwner ? 0 : 1);
    await expect(panel.getByLabel("Received by")).toHaveCount(0);
    if (hasAccountOwner) {
      await expect(panel.getByText(/This account belongs to/)).toBeVisible();
    }

    await panel.getByRole("radio", { name: /Shared/ }).check();
    await expect(panel.getByRole("radio", { name: /Shared/ })).toBeChecked();
    await expect(panel.getByLabel("Whose personal expense?")).toHaveCount(0);
    await expect(panel.getByLabel("Paid by")).toHaveCount(hasAccountOwner ? 0 : 1);
    await expect(panel.getByLabel("Received by")).toHaveCount(0);
    if (hasAccountOwner) {
      await expect(panel.getByText(/Paid from /)).toBeVisible();
    }
    if (before.members.length >= 2) {
      await expect(panel.getByRole("checkbox", { name: "Split this later" })).toBeVisible();
    } else {
      await expect(panel.getByRole("checkbox", { name: "Split this later" })).toHaveCount(0);
    }

    await expect(panel.getByRole("radio", { name: /Household/ })).toHaveCount(0);
    await expect(panel.getByRole("radio", { name: /Transfer/ })).toBeVisible();
    await expect(panel.getByRole("radio", { name: /Ignore/ })).toBeVisible();

    await panel.getByRole("radio", { name: /Income/ }).check();
    await expect(panel.getByRole("radio", { name: /Income/ })).toBeChecked();
    await expect(panel.getByLabel("Whose personal expense?")).toHaveCount(0);
    await expect(panel.getByLabel("Paid by")).toHaveCount(0);
    await expect(panel.getByLabel("Received by")).toHaveCount(hasAccountOwner ? 0 : 1);
    if (hasAccountOwner) {
      await expect(panel.getByText(/Received into /)).toBeVisible();
    }
  });

  test("keyboard shortcuts choose a type, select a category, and skip without saving", async ({
    page,
  }) => {
    const before = await loadReviewData(page);
    test.skip(before.queue.length < 2, "The keyboard test needs two review rows.");

    await page.goto("/transactions/review");
    await expect(page.getByRole("heading", { name: "Transactions", exact: true })).toBeVisible();

    const activeRow = page.locator('[data-review-transaction-id][aria-current="true"]');
    const startingId = await activeRow.getAttribute("data-review-transaction-id");

    await page.getByRole("heading", { name: "This transaction" }).click();
    await page.getByRole("searchbox", { name: "Search" }).blur();
    await page.keyboard.press("1");
    await expect(page.getByRole("radio", { name: /Personal/ })).toBeChecked();
    await page.keyboard.press("2");
    await expect(page.getByRole("radio", { name: /Shared/ })).toBeChecked();
    await page.keyboard.press("4");
    await expect(page.getByRole("radio", { name: /Transfer/ })).toBeChecked();
    await page.keyboard.press("5");
    await expect(page.getByRole("radio", { name: /Ignore/ })).toBeChecked();
    await page.keyboard.press("3");
    await expect(page.getByRole("radio", { name: /Income/ })).toBeChecked();

    await page.keyboard.press("c");
    const category = page.getByRole("combobox", { name: "Category", exact: true });
    await expect(category).toBeFocused();
    await expect(category).toHaveAttribute("aria-expanded", "true");
    await category.press("ArrowDown");
    await category.press("Enter");
    await expect(category).not.toHaveValue("");

    await page.getByRole("heading", { name: "Transactions", exact: true }).click();
    await page.keyboard.press("s");
    await expect(activeRow).not.toHaveAttribute("data-review-transaction-id", startingId!);

    const after = await loadReviewData(page);
    expect(after.summary.queueCount).toBe(before.summary.queueCount);
  });

  test("radio, combobox, and shortcut-help keyboard contracts remain isolated", async ({ page }) => {
    const before = await loadReviewData(page);
    test.skip(before.queue.length < 2, "The keyboard isolation test needs two review rows.");

    await page.goto("/transactions/review");

    const activeRow = page.locator('[data-review-transaction-id][aria-current="true"]');
    const startingRowId = await activeRow.getAttribute("data-review-transaction-id");
    await page.getByRole("heading", { name: "Transactions", exact: true }).click();
    await page.getByRole("searchbox", { name: "Search" }).blur();
    await page.keyboard.press("ArrowDown");
    await expect(activeRow).not.toHaveAttribute("data-review-transaction-id", startingRowId!);

    const personal = page.getByRole("radio", { name: /Personal/ });
    const shared = page.getByRole("radio", { name: /Shared/ });
    await personal.focus();
    await page.keyboard.press("ArrowRight");
    await expect(shared).toBeChecked();
    await expect(shared).toBeFocused();

    const category = page.getByRole("combobox", { name: "Category", exact: true });
    const originalValue = await category.inputValue();
    await category.click();
    const controlsId = await category.getAttribute("aria-controls");
    const activeDescendant = await category.getAttribute("aria-activedescendant");
    expect(controlsId).toBeTruthy();
    expect(activeDescendant).toBeTruthy();
    await expect(page.locator(`#${controlsId}`)).toHaveAttribute("role", "listbox");
    await expect(page.locator(`#${activeDescendant}`)).toHaveAttribute("role", "option");
    await category.fill("not a saved category");
    await category.press("Escape");
    await expect(category).toHaveAttribute("aria-expanded", "false");
    await expect(category).toHaveValue(originalValue);
    await category.press("Tab");
    await expect(category).not.toBeFocused();

    await page.getByRole("button", { name: /Keyboard shortcuts/ }).click();
    const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(help).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();
  });

  test("a focused correction dual-writes the category and Undo restores the queue", async ({
    page,
  }) => {
    const before = await loadReviewData(page);
    const transaction = before.queue[0];
    const category = before.categoryCatalog[0];
    test.skip(!transaction || !category, "The seeded review queue needs a row and a category.");

    let undoBatchId: string | undefined;
    try {
      await page.goto(`/transactions/review?transactionId=${transaction.id}`);
      await expect(page.locator(`[data-review-transaction-id="${transaction.id}"]`)).toHaveAttribute(
        "aria-current",
        "true",
      );

      await page.getByRole("radio", { name: /Shared/ }).check();
      const categoryInput = page.getByRole("combobox", { name: "Category", exact: true });
      await categoryInput.click();
      await page.getByRole("option", { name: category.name, exact: true }).click();

      const saveResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/transaction-classifications")
          && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: /Save and next|Save classification/ }).click();
      const saveResponse = await saveResponsePromise;
      expect(saveResponse.ok()).toBeTruthy();
      const savePayload = (await saveResponse.json()) as { undoBatchId?: string };
      undoBatchId = savePayload.undoBatchId;
      expect(undoBatchId).toBeTruthy();

      await expect(page.getByText("This transaction is already classified", { exact: false })).toBeVisible();
      await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
      await page.getByText("Report month allocation", { exact: true }).click();
      await expect(page.getByRole("button", { name: "Save allocation", exact: true })).toBeVisible();

      const classified = await page.request.get(
        `/api/imports/review?transactionId=${transaction.id}&page=1&pageSize=1`,
      );
      const classifiedPayload = (await classified.json()) as {
        focusTransaction?: { classification?: { categoryId?: string; category?: string } };
      };
      expect(classifiedPayload.focusTransaction?.classification?.categoryId).toBe(category.id);
      expect(classifiedPayload.focusTransaction?.classification?.category).toBe(category.name);

      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(page.getByText(`Restored ${transaction.merchantRaw ?? "transaction"}.`)).toBeVisible();
      undoBatchId = undefined;

      const after = await loadReviewData(page);
      expect(after.summary.queueCount).toBe(before.summary.queueCount);
      expect(after.queue.some((item) => item.id === transaction.id)).toBeTruthy();
    } finally {
      if (undoBatchId) {
        const cleanup = await page.request.post("/api/transaction-classifications/undo", {
          data: { batchId: undoBatchId },
        });
        expect(cleanup.ok()).toBeTruthy();
      }
    }
  });

  test("Save and next advances within the visible queue and remains undoable", async ({ page }) => {
    const before = await loadReviewData(page);
    const transaction = before.queue[0];
    test.skip(before.queue.length < 2 || !transaction, "Save and next needs two review rows.");

    let undoBatchId: string | undefined;
    try {
      await page.goto("/transactions/review");
      const activeRow = page.locator('[data-review-transaction-id][aria-current="true"]');
      await expect(activeRow).toHaveAttribute("data-review-transaction-id", transaction.id);

      await page.getByRole("heading", { name: "This transaction" }).click();
      await page.getByRole("searchbox", { name: "Search" }).blur();
      await page.keyboard.press("5");
      await expect(page.getByRole("radio", { name: /Ignore/ })).toBeChecked();
      const saveResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/transaction-classifications")
          && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: /Save and next/ }).click();
      const saveResponse = await saveResponsePromise;
      expect(saveResponse.ok()).toBeTruthy();
      const savePayload = (await saveResponse.json()) as { undoBatchId?: string };
      undoBatchId = savePayload.undoBatchId;
      expect(undoBatchId).toBeTruthy();

      await expect(activeRow).not.toHaveAttribute("data-review-transaction-id", transaction.id);
      const classified = await loadReviewData(page);
      expect(classified.summary.queueCount).toBe(before.summary.queueCount - 1);

      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(page.getByText(`Restored ${transaction.merchantRaw ?? "transaction"}.`)).toBeVisible();
      undoBatchId = undefined;
      const after = await loadReviewData(page);
      expect(after.summary.queueCount).toBe(before.summary.queueCount);
    } finally {
      if (undoBatchId) {
        const cleanup = await page.request.post("/api/transaction-classifications/undo", {
          data: { batchId: undoBatchId },
        });
        expect(cleanup.ok()).toBeTruthy();
      }
    }
  });

  test("exact merchant rules remain explicit and are restored by Undo", async ({ page }) => {
    const before = await loadReviewData(page);
    const transaction = before.queue.find((item) => item.merchantRaw?.trim());
    const category = before.categoryCatalog[0];
    test.skip(!transaction || !category, "The rule test needs a merchant and category.");

    let undoBatchId: string | undefined;
    try {
      await page.goto(`/transactions/review?transactionId=${transaction!.id}`);
      const sharedRadio = page.getByRole("radio", { name: /Shared/ });
      await sharedRadio.check();
      await expect(sharedRadio).toBeChecked();
      const categoryInput = page.getByRole("combobox", { name: "Category", exact: true });
      await categoryInput.click();
      await page.getByRole("option", { name: category!.name, exact: true }).click();
      await page.getByRole("checkbox", { name: /Automatically classify/ }).check();
      await expect(page.getByText(/exact-match rule/)).toBeVisible();

      const saveResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/transaction-classifications")
          && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: /Save and next|Save classification/ }).click();
      const saveResponse = await saveResponsePromise;
      expect(saveResponse.ok()).toBeTruthy();
      const savePayload = (await saveResponse.json()) as { undoBatchId?: string };
      undoBatchId = savePayload.undoBatchId;
      expect(undoBatchId).toBeTruthy();
      await expect(page.getByText(/Classification and rule saved/)).toBeVisible();

      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(page.getByText(`Restored ${transaction!.merchantRaw}.`)).toBeVisible();
      undoBatchId = undefined;
      const after = await loadReviewData(page);
      expect(after.summary.queueCount).toBe(before.summary.queueCount);
    } finally {
      if (undoBatchId) {
        const cleanup = await page.request.post("/api/transaction-classifications/undo", {
          data: { batchId: undoBatchId },
        });
        expect(cleanup.ok()).toBeTruthy();
      }
    }
  });

  test("one review decision can include matching waiting transactions", async ({ page }) => {
    const before = await loadReviewData(page);
    const category = before.categoryCatalog[0];
    const merchantCounts = new Map<string, number>();
    for (const item of before.queue) {
      const merchant = item.merchantRaw?.trim().toLocaleLowerCase();
      if (merchant) merchantCounts.set(merchant, (merchantCounts.get(merchant) ?? 0) + 1);
    }
    const transaction = before.queue.find((item) => {
      const merchant = item.merchantRaw?.trim().toLocaleLowerCase();
      return merchant && (merchantCounts.get(merchant) ?? 0) > 1;
    });
    test.skip(!transaction || !category, "The matching-merchant test needs repeated queue rows.");

    let undoBatchId: string | undefined;
    try {
      await page.goto(`/transactions/review?transactionId=${transaction!.id}`);
      await page.getByRole("radio", { name: /Shared/ }).check();
      const categoryInput = page.getByRole("combobox", { name: "Category", exact: true });
      await categoryInput.click();
      await page.getByRole("option", { name: category!.name, exact: true }).click();
      const applyToSimilar = page.getByRole("checkbox", { name: /Also apply to/ });
      await applyToSimilar.check();
      await expect(applyToSimilar).toBeChecked();

      const saveResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/transaction-classifications")
          && response.request().method() === "POST",
      );
      const saveButton = page.getByRole("button", { name: /Save and next|Save classification/ });
      await expect(saveButton).toBeEnabled();
      await saveButton.click();
      const saveResponse = await saveResponsePromise;
      expect(saveResponse.ok()).toBeTruthy();
      const payload = (await saveResponse.json()) as { undoBatchId?: string; updatedCount?: number };
      undoBatchId = payload.undoBatchId;
      expect(payload.updatedCount).toBeGreaterThan(1);
      await expect(page.getByText(new RegExp(`across ${payload.updatedCount} transactions`))).toBeVisible();

      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(page.getByText(`Restored ${payload.updatedCount} transactions.`)).toBeVisible();
      undoBatchId = undefined;
    } finally {
      if (undoBatchId) {
        const cleanup = await page.request.post("/api/transaction-classifications/undo", {
          data: { batchId: undoBatchId },
        });
        expect(cleanup.ok()).toBeTruthy();
      }
    }
  });

  test("classification APIs reject categories and members outside the workspace", async ({ page }) => {
    const before = await loadReviewData(page);
    const transaction = before.queue[0];
    test.skip(!transaction, "The validation test needs a review row.");

    const invalidCategory = await page.request.post("/api/transaction-classifications", {
      data: {
        transactionId: transaction!.id,
        classificationType: "shared",
        categoryId: "00000000-0000-4000-8000-000000000001",
      },
    });
    expect(invalidCategory.status()).toBe(400);

    const invalidMember = await page.request.post("/api/transaction-classifications", {
      data: {
        transactionId: transaction!.id,
        classificationType: "personal",
        personalOwnerMemberId: "00000000-0000-4000-8000-000000000002",
      },
    });
    expect(invalidMember.status()).toBe(400);

    const invalidBulkCategory = await page.request.post("/api/transaction-classifications/bulk", {
      data: {
        transactionIds: [transaction!.id],
        classificationType: "shared",
        categoryId: "00000000-0000-4000-8000-000000000001",
      },
    });
    expect(invalidBulkCategory.status()).toBe(400);

    const invalidBulkMember = await page.request.post("/api/transaction-classifications/bulk", {
      data: {
        transactionIds: [transaction!.id],
        classificationType: "personal",
        personalOwnerMemberId: "00000000-0000-4000-8000-000000000002",
      },
    });
    expect(invalidBulkMember.status()).toBe(400);

    const after = await loadReviewData(page);
    expect(after.summary.queueCount).toBe(before.summary.queueCount);
    expect(after.queue.some((item) => item.id === transaction!.id)).toBeTruthy();
  });

  test("shared classifications preserve the selected payer for settlement workflows", async ({
    page,
  }) => {
    const before = await loadReviewData(page);
    const transaction = before.queue[0];
    const member = before.members[0];
    test.skip(!transaction || !member, "The shared test needs a review row and workspace member.");

    let undoBatchId: string | undefined;
    try {
      const response = await page.request.post("/api/transaction-classifications", {
        data: {
          transactionId: transaction!.id,
          classificationType: "shared",
          paidByMemberId: member!.id,
        },
      });
      expect(response.ok()).toBeTruthy();
      const payload = (await response.json()) as { undoBatchId?: string };
      undoBatchId = payload.undoBatchId;

      const focusedResponse = await page.request.get(
        `/api/imports/review?transactionId=${transaction!.id}&page=1&pageSize=1`,
      );
      const focused = (await focusedResponse.json()) as {
        focusTransaction?: { classification?: { paidByMemberId?: string; classificationType?: string } };
      };
      expect(focused.focusTransaction?.classification?.classificationType).toBe("shared");
      expect(focused.focusTransaction?.classification?.paidByMemberId).toBe(
        transaction!.accountOwnerMemberId ?? member!.id,
      );
    } finally {
      if (undoBatchId) {
        const cleanup = await page.request.post("/api/transaction-classifications/undo", {
          data: { batchId: undoBatchId },
        });
        expect(cleanup.ok()).toBeTruthy();
      }
    }
  });

  test("personal owner and payer can differ without changing spending scope", async ({ page }) => {
    const before = await loadReviewData(page);
    const transaction = before.queue[0];
    const accountOwnerId = transaction?.accountOwnerMemberId;
    const owner = before.members.find((member) => member.id !== accountOwnerId) ?? before.members[0];
    test.skip(!transaction || !owner, "The personal attribution test needs a review row and member.");

    let undoBatchId: string | undefined;
    try {
      const response = await page.request.post("/api/transaction-classifications", {
        data: {
          transactionId: transaction!.id,
          classificationType: "personal",
          personalOwnerMemberId: owner!.id,
          paidByMemberId: before.members[0]?.id,
        },
      });
      expect(response.ok()).toBeTruthy();
      const payload = (await response.json()) as { undoBatchId?: string };
      undoBatchId = payload.undoBatchId;

      const focusedResponse = await page.request.get(
        `/api/imports/review?transactionId=${transaction!.id}&page=1&pageSize=1`,
      );
      const focused = (await focusedResponse.json()) as {
        focusTransaction?: {
          classification?: {
            classificationType?: string;
            personalOwnerMemberId?: string;
            paidByMemberId?: string;
          };
        };
      };
      expect(focused.focusTransaction?.classification?.classificationType).toBe("personal");
      expect(focused.focusTransaction?.classification?.personalOwnerMemberId).toBe(owner!.id);
      expect(focused.focusTransaction?.classification?.paidByMemberId).toBe(
        accountOwnerId ?? before.members[0]?.id,
      );
    } finally {
      if (undoBatchId) {
        const cleanup = await page.request.post("/api/transaction-classifications/undo", {
          data: { batchId: undoBatchId },
        });
        expect(cleanup.ok()).toBeTruthy();
      }
    }
  });

  test("bulk classification requires confirmation and Undo restores every selected row", async ({
    page,
  }) => {
    const before = await loadReviewData(page);
    const transactions = before.queue.slice(0, 2);
    const category = before.categoryCatalog[0];
    test.skip(transactions.length < 2 || !category, "The bulk test needs two rows and a category.");

    let undoBatchId: string | undefined;
    try {
      await page.goto("/transactions/review");
      for (const transaction of transactions) {
        const row = page.locator(`[data-review-transaction-id="${transaction.id}"]`);
        await row.getByRole("checkbox").check();
      }

      await expect(page.getByRole("button", { name: "Classify selected", exact: true })).toHaveCount(0);
      const panel = page.getByRole("article").filter({
        has: page.getByRole("heading", { name: "2 transactions", exact: true }),
      });
      await expect(panel).toBeVisible();
      await expect(panel.getByText("One classification applies to every marked row.")).toBeVisible();
      await panel.getByRole("radio", { name: /Shared/ }).check();
      const categoryInput = panel.getByRole("combobox", { name: "Category", exact: true });
      await categoryInput.click();
      await panel.getByRole("option", { name: category.name, exact: true }).click();

      const bulkResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/transaction-classifications/bulk")
          && response.request().method() === "POST",
      );
      await panel.getByRole("button", { name: "Apply to 2 transactions", exact: true }).click();
      const bulkResponse = await bulkResponsePromise;
      expect(bulkResponse.ok()).toBeTruthy();
      const bulkPayload = (await bulkResponse.json()) as { undoBatchId?: string };
      undoBatchId = bulkPayload.undoBatchId;
      expect(undoBatchId).toBeTruthy();
      await expect(page.getByText("Classification applied to 2 transactions.")).toBeVisible();

      const nextTransactions = before.queue.slice(2, 4);
      test.skip(nextTransactions.length < 2, "The leftover-form check needs two more review rows.");
      for (const transaction of nextTransactions) {
        const row = page.locator(`[data-review-transaction-id="${transaction.id}"]`);
        await row.getByRole("checkbox").check();
      }
      const nextPanel = page.getByRole("article").filter({
        has: page.getByRole("heading", { name: "2 transactions", exact: true }),
      });
      await expect(nextPanel).toBeVisible();
      await expect(nextPanel.getByRole("radio", { name: /Shared/ })).not.toBeChecked();
      await expect(nextPanel.getByRole("combobox", { name: "Category", exact: true })).toHaveValue("");
      await nextPanel.getByRole("button", { name: "Clear marks", exact: true }).click();
      await expect(page.getByRole("heading", { name: "This transaction", exact: true })).toBeVisible();

      const classified = await loadReviewData(page);
      expect(classified.summary.queueCount).toBe(before.summary.queueCount - 2);

      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(page.getByText("Restored 2 transactions.")).toBeVisible();
      undoBatchId = undefined;

      const after = await loadReviewData(page);
      expect(after.summary.queueCount).toBe(before.summary.queueCount);
      expect(transactions.every((item) => after.queue.some((row) => row.id === item.id))).toBeTruthy();
    } finally {
      if (undoBatchId) {
        const cleanup = await page.request.post("/api/transaction-classifications/undo", {
          data: { batchId: undoBatchId },
        });
        expect(cleanup.ok()).toBeTruthy();
      }
    }
  });

  test("command enter with two marks posts the bulk classification", async ({ page }) => {
    const before = await loadReviewData(page);
    const transactions = before.queue.slice(0, 2);
    test.skip(transactions.length < 2, "The shortcut bulk test needs two review rows.");

    let undoBatchId: string | undefined;
    try {
      await page.goto("/transactions/review");
      for (const transaction of transactions) {
        await page.locator(`[data-review-transaction-id="${transaction.id}"]`).getByRole("checkbox").check();
      }
      const panel = page.getByRole("article").filter({
        has: page.getByRole("heading", { name: "2 transactions", exact: true }),
      });
      await panel.getByRole("heading", { name: "2 transactions", exact: true }).click();
      await page.keyboard.press("2");
      await expect(panel.getByRole("radio", { name: /Shared/ })).toBeChecked();

      const bulkResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/transaction-classifications/bulk")
          && response.request().method() === "POST",
      );
      await page.keyboard.press("ControlOrMeta+Enter");
      const bulkResponse = await bulkResponsePromise;
      expect(bulkResponse.ok()).toBeTruthy();
      const posted = bulkResponse.request().postDataJSON() as { transactionIds?: string[] };
      expect(posted.transactionIds?.slice().sort()).toEqual(transactions.map((item) => item.id).sort());
      const payload = (await bulkResponse.json()) as { undoBatchId?: string };
      undoBatchId = payload.undoBatchId;
    } finally {
      if (undoBatchId) {
        const cleanup = await page.request.post("/api/transaction-classifications/undo", {
          data: { batchId: undoBatchId },
        });
        expect(cleanup.ok()).toBeTruthy();
      }
    }
  });

  test("similar merchants prefill the wide panel without opening a dialog", async ({ page }) => {
    const before = await loadReviewData(page);
    const group = duplicateMerchantGroup(before.queue);
    test.skip(!group, "Similar merchants need two rows with the same merchant.");

    await page.goto("/transactions/review");
    await page.locator(`[data-review-transaction-id="${group![0]!.id}"]`).click();
    const singlePanel = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "This transaction", exact: true }),
    });
    await singlePanel.getByRole("radio", { name: /Shared/ }).check();
    await singlePanel.getByRole("button", { name: /Mark and classify together/ }).click();

    await expect(page.getByRole("dialog", { name: "Classify selected" })).toHaveCount(0);
    const batchPanel = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: /\d+ transactions/ }),
    });
    await expect(batchPanel.getByRole("radio", { name: /Shared/ })).toBeChecked();
  });
});

test.describe("stacked review batch", () => {
  test.use({ viewport: { width: 960, height: 800 } });

  test("one marked row still saves only that row", async ({ page }) => {
    const before = await loadReviewData(page);
    test.skip(before.queue.length < 1, "The stacked hint needs a review row.");

    await page.goto("/transactions/review");
    const transaction = before.queue[0]!;
    await page.locator(`[data-review-transaction-id="${transaction.id}"]`).getByRole("checkbox").check();

    const panel = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "This transaction", exact: true }),
    });
    await expect(panel.getByText("Check more rows to classify them together in this panel.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Classify selected", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Batch classification" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: /Save and next|Save classification/ })).toBeVisible();
  });

  test("two marked rows open the dialog from the bottom bar", async ({ page }) => {
    const before = await loadReviewData(page);
    const transactions = before.queue.slice(0, 2);
    test.skip(transactions.length < 2, "The stacked batch bar needs two review rows.");

    await page.goto("/transactions/review");
    for (const transaction of transactions) {
      await page.locator(`[data-review-transaction-id="${transaction.id}"]`).getByRole("checkbox").check();
    }

    const panel = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "This transaction", exact: true }),
    });
    await expect(panel.getByText("Saving here classifies this row only.")).toBeVisible();
    await expect(panel.getByRole("heading", { name: /\d+ transactions/ })).toHaveCount(0);

    const bar = page.getByRole("region", { name: "Batch classification" });
    await expect(bar.getByText("2 marked")).toBeVisible();
    const nav = page.locator(".app-mobile-nav");
    const barBox = await bar.boundingBox();
    const navBox = await nav.boundingBox();
    expect(barBox).toBeTruthy();
    expect(navBox).toBeTruthy();
    const gap = navBox!.y - (barBox!.y + barBox!.height);
    expect(gap).toBeGreaterThanOrEqual(4);
    expect(gap).toBeLessThanOrEqual(16);

    await bar.getByRole("button", { name: "Classify selected", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Classify selected" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Apply to selected", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test("similar merchants open the dialog with the single-row prefill", async ({ page }) => {
    const before = await loadReviewData(page);
    const group = duplicateMerchantGroup(before.queue);
    test.skip(!group, "Similar merchants need two rows with the same merchant.");

    await page.goto("/transactions/review");
    await page.locator(`[data-review-transaction-id="${group![0]!.id}"]`).click();
    const panel = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "This transaction", exact: true }),
    });
    await panel.getByRole("radio", { name: /Shared/ }).check();
    await panel.getByRole("button", { name: /Mark and classify together/ }).click();

    const dialog = page.getByRole("dialog", { name: "Classify selected" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("radio", { name: /Shared/ })).toBeChecked();
    await expect(panel.getByText("Saving here classifies this row only.")).toBeVisible();
  });
});

test.describe("responsive review workflow", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile review does not overflow the viewport", async ({ page }) => {
    await page.goto("/transactions/review");
    await expect(page.getByRole("heading", { name: "This transaction" })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
});

async function readReviewBoardMetrics(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".app-shell");
    const scrollport = document.querySelector(".app-main-scroll");
    const workspace = document.querySelector(".review-workspace");
    const board = document.querySelector(".review-board");
    const wrap = document.querySelector(".review-table-wrap");
    const detail = document.querySelector(".review-detail");
    const nav = document.querySelector(".app-mobile-nav");
    if (
      !(shell instanceof HTMLElement)
      || !(scrollport instanceof HTMLElement)
      || !(workspace instanceof HTMLElement)
      || !(board instanceof HTMLElement)
    ) {
      return null;
    }

    const navVisible = nav instanceof HTMLElement && getComputedStyle(nav).display !== "none";
    const columns = getComputedStyle(board).gridTemplateColumns.split(" ").filter(Boolean);
    return {
      shellOverflow: getComputedStyle(shell).overflow,
      scrollportOverflowX: getComputedStyle(scrollport).overflowX,
      locked: workspace.classList.contains("review-workspace-locked"),
      scrollportScrollTop: scrollport.scrollTop,
      documentOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      boardBottom: board.getBoundingClientRect().bottom,
      navTop: navVisible && nav instanceof HTMLElement ? nav.getBoundingClientRect().top : null,
      columnCount: columns.length,
      detailPosition: detail instanceof HTMLElement ? getComputedStyle(detail).position : null,
      wrapScrolls: wrap instanceof HTMLElement && getComputedStyle(wrap).overflowY === "auto",
      paginationTop: document.querySelector(".review-pagination")?.getBoundingClientRect().top ?? null,
      viewportHeight: window.innerHeight,
    };
  });
}

test.describe("review board scroll lock", () => {
  test.use({ viewport: { width: 1440, height: 1100 } });

  test("desktop review scrolls the queue inside the board", async ({ page }) => {
    await page.goto("/transactions/review");
    await expect(page.getByRole("heading", { name: "This transaction" })).toBeVisible();
    await expect.poll(() => readReviewBoardMetrics(page).then((metrics) => metrics?.locked)).toBe(true);

    const metrics = await readReviewBoardMetrics(page);
    expect(metrics).toBeTruthy();
    expect(metrics!.shellOverflow).toBe("visible");
    expect(metrics!.scrollportOverflowX).toBe("hidden");
    expect(metrics!.documentOverflow).toBeLessThanOrEqual(1);
    expect(metrics!.scrollportScrollTop).toBe(0);
    expect(metrics!.columnCount).toBe(2);
    expect(metrics!.detailPosition).toBe("static");
    expect(metrics!.wrapScrolls).toBe(true);
    if (metrics!.paginationTop != null) {
      expect(metrics!.paginationTop).toBeLessThanOrEqual(metrics!.viewportHeight);
    }

    const moved = await page.evaluate(() => {
      const wrap = document.querySelector(".review-table-wrap");
      const scrollport = document.querySelector(".app-main-scroll");
      if (!(wrap instanceof HTMLElement) || !(scrollport instanceof HTMLElement)) return null;
      wrap.scrollTop = Math.min(120, wrap.scrollHeight);
      return {
        wrapTop: wrap.scrollTop,
        scrollportTop: scrollport.scrollTop,
        windowY: window.scrollY,
      };
    });
    expect(moved?.wrapTop).toBeGreaterThan(0);
    expect(moved?.scrollportTop).toBe(0);
    expect(moved?.windowY).toBe(0);
  });
});

test.describe("review board above the tab bar", () => {
  test.use({ viewport: { width: 1000, height: 1400 } });

  test("keeps two columns and clears the tab bar", async ({ page }) => {
    await page.goto("/transactions/review");
    await expect(page.getByRole("heading", { name: "This transaction" })).toBeVisible();
    await expect.poll(() => readReviewBoardMetrics(page).then((metrics) => metrics?.locked)).toBe(true);

    const metrics = await readReviewBoardMetrics(page);
    expect(metrics?.columnCount).toBe(2);
    expect(metrics?.shellOverflow).toBe("visible");
    expect(metrics?.scrollportOverflowX).toBe("hidden");
    expect(metrics?.navTop).not.toBeNull();
    expect(metrics!.boardBottom).toBeLessThanOrEqual(metrics!.navTop! + 1);
    await expect(page.getByRole("button", { name: "Classify selected", exact: true })).toHaveCount(0);
  });
});

test.describe("review board short window", () => {
  test.use({ viewport: { width: 1280, height: 520 } });

  test("falls back to page scroll", async ({ page }) => {
    await page.goto("/transactions/review");
    await expect(page.getByRole("heading", { name: "This transaction" })).toBeVisible();

    const metrics = await readReviewBoardMetrics(page);
    expect(metrics?.locked).toBe(false);
    expect(metrics?.detailPosition).toBe("sticky");
    expect(metrics?.shellOverflow).toBe("visible");
    expect(metrics?.scrollportOverflowX).toBe("hidden");
  });
});
