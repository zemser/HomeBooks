import { expect, test } from "@playwright/test";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("manual-entry categories use stable catalog IDs", async ({ page }) => {
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Add manual transaction", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add manual transaction" });
  const category = dialog.getByLabel("Category");
  const values = await category.locator("option").evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
  );
  expect(values.length).toBeGreaterThan(0);
  expect(values.every((value) => UUID_PATTERN.test(value))).toBeTruthy();
});

test("recurring categories use stable catalog IDs", async ({ page }) => {
  await page.goto("/recurring");
  await page.getByRole("button", { name: "Add recurring rule", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add recurring rule" });
  const category = dialog.getByLabel("Category");
  const values = await category.locator("option").evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
  );
  expect(values.length).toBeGreaterThan(0);
  expect(values.every((value) => UUID_PATTERN.test(value))).toBeTruthy();
});
