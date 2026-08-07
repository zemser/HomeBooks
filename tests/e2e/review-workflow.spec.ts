import { expect, test, type Page } from "@playwright/test";

type ReviewResponse = {
  queue: Array<{
    id: string;
    merchantRaw: string | null;
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

    await page.goto("/imports/review");
    await expect(page.getByRole("heading", { name: "Review transactions" })).toBeVisible();

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
    await page.goto("/imports/review");
    await expect(page.getByRole("heading", { name: "Review transactions" })).toBeVisible();

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
    await page.goto("/imports/review");
    await expect(page.getByRole("heading", { name: "Review transactions" })).toBeVisible();

    await expect(page.getByRole("columnheader", { name: "Suggestion" })).toHaveCount(0);
    await expect(page.locator('.review-table td[data-label="Suggestion"]')).toHaveCount(0);
  });

  test("keyboard shortcuts choose a type, select a category, and skip without saving", async ({
    page,
  }) => {
    const before = await loadReviewData(page);
    test.skip(before.queue.length < 2, "The keyboard test needs two review rows.");

    await page.goto("/imports/review");
    await expect(page.getByRole("heading", { name: "Review transactions" })).toBeVisible();

    const activeRow = page.locator('[data-review-transaction-id][aria-current="true"]');
    const startingId = await activeRow.getAttribute("data-review-transaction-id");

    await page.getByRole("heading", { name: "Review transactions" }).click();
    await page.keyboard.press("3");
    await expect(page.getByRole("radio", { name: /Household/ })).toBeChecked();

    await page.keyboard.press("c");
    const category = page.getByRole("combobox", { name: "Category", exact: true });
    await expect(category).toBeFocused();
    await expect(category).toHaveAttribute("aria-expanded", "true");
    await category.press("ArrowDown");
    await category.press("Enter");
    await expect(category).not.toHaveValue("");

    await page.getByRole("heading", { name: "Review transactions" }).click();
    await page.keyboard.press("s");
    await expect(activeRow).not.toHaveAttribute("data-review-transaction-id", startingId!);

    const after = await loadReviewData(page);
    expect(after.summary.queueCount).toBe(before.summary.queueCount);
  });

  test("radio, combobox, and shortcut-help keyboard contracts remain isolated", async ({ page }) => {
    await page.goto("/imports/review");

    const activeRow = page.locator('[data-review-transaction-id][aria-current="true"]');
    const startingRowId = await activeRow.getAttribute("data-review-transaction-id");
    await activeRow.focus();
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
      await page.goto(`/imports/review?transactionId=${transaction.id}`);
      await expect(page.locator(`[data-review-transaction-id="${transaction.id}"]`)).toHaveAttribute(
        "aria-current",
        "true",
      );

      await page.getByRole("radio", { name: /Household/ }).check();
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
      await page.goto("/imports/review");
      const activeRow = page.locator('[data-review-transaction-id][aria-current="true"]');
      await expect(activeRow).toHaveAttribute("data-review-transaction-id", transaction.id);

      await page.getByRole("radio", { name: /Ignore/ }).check();
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
      await page.goto(`/imports/review?transactionId=${transaction!.id}`);
      const householdRadio = page.getByRole("radio", { name: /Household/ });
      await householdRadio.check();
      await expect(householdRadio).toBeChecked();
      const categoryInput = page.getByRole("combobox", { name: "Category", exact: true });
      await categoryInput.click();
      await page.getByRole("option", { name: category!.name, exact: true }).click();
      await page.getByRole("checkbox", { name: /Use this decision for future exact merchant matches/ }).check();
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
      await page.goto(`/imports/review?transactionId=${transaction!.id}`);
      await page.getByRole("radio", { name: /Household/ }).check();
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
        classificationType: "household",
        categoryId: "00000000-0000-4000-8000-000000000001",
      },
    });
    expect(invalidCategory.status()).toBe(400);

    const invalidMember = await page.request.post("/api/transaction-classifications", {
      data: {
        transactionId: transaction!.id,
        classificationType: "personal",
        memberOwnerId: "00000000-0000-4000-8000-000000000002",
      },
    });
    expect(invalidMember.status()).toBe(400);

    const invalidBulkCategory = await page.request.post("/api/transaction-classifications/bulk", {
      data: {
        transactionIds: [transaction!.id],
        classificationType: "household",
        categoryId: "00000000-0000-4000-8000-000000000001",
      },
    });
    expect(invalidBulkCategory.status()).toBe(400);

    const invalidBulkMember = await page.request.post("/api/transaction-classifications/bulk", {
      data: {
        transactionIds: [transaction!.id],
        classificationType: "personal",
        memberOwnerId: "00000000-0000-4000-8000-000000000002",
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
          memberOwnerId: member!.id,
        },
      });
      expect(response.ok()).toBeTruthy();
      const payload = (await response.json()) as { undoBatchId?: string };
      undoBatchId = payload.undoBatchId;

      const focusedResponse = await page.request.get(
        `/api/imports/review?transactionId=${transaction!.id}&page=1&pageSize=1`,
      );
      const focused = (await focusedResponse.json()) as {
        focusTransaction?: { classification?: { memberOwnerId?: string; classificationType?: string } };
      };
      expect(focused.focusTransaction?.classification?.classificationType).toBe("shared");
      expect(focused.focusTransaction?.classification?.memberOwnerId).toBe(member!.id);
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
      await page.goto("/imports/review");
      for (const transaction of transactions) {
        const row = page.locator(`[data-review-transaction-id="${transaction.id}"]`);
        await row.getByRole("checkbox").check();
      }

      await page.getByRole("button", { name: "Classify selected", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Classify selected" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("radio", { name: /Household/ }).check();
      const categoryInput = dialog.getByRole("combobox", { name: "Category", exact: true });
      await categoryInput.click();
      await dialog.getByRole("option", { name: category.name, exact: true }).click();

      const bulkResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/transaction-classifications/bulk")
          && response.request().method() === "POST",
      );
      await dialog.getByRole("button", { name: "Apply to selected", exact: true }).click();
      const bulkResponse = await bulkResponsePromise;
      expect(bulkResponse.ok()).toBeTruthy();
      const bulkPayload = (await bulkResponse.json()) as { undoBatchId?: string };
      undoBatchId = bulkPayload.undoBatchId;
      expect(undoBatchId).toBeTruthy();
      await expect(page.getByText("Classification applied to 2 transactions.")).toBeVisible();

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
});

test.describe("responsive review workflow", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile review does not overflow the viewport", async ({ page }) => {
    await page.goto("/imports/review");
    await expect(page.getByRole("heading", { name: "Selected transaction" })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
});
