import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("year view year-summary link downloads a CSV with the machine header", async ({ page }) => {
  await page.goto("/reports?view=year");
  await expect(page.getByTestId("reports-content")).toBeVisible();

  const summary = page.getByRole("link", { name: "Download year summary" });
  const category = page.getByRole("link", { name: "Download category detail" });
  const workbook = page.getByRole("link", { name: "Download Excel workbook" });

  await expect(summary).toBeVisible();
  await expect(category).toBeVisible();
  await expect(workbook).toBeVisible();

  await expect(summary).toHaveAttribute("href", /\/api\/reports\/export\?.*kind=year_summary/);
  await expect(summary).toHaveAttribute("href", /[?&]month=/);
  await expect(summary).toHaveAttribute("href", /[?&]mode=/);
  await expect(category).toHaveAttribute("href", /kind=category_detail/);
  await expect(workbook).toHaveAttribute("href", /kind=workbook/);

  const [download] = await Promise.all([page.waitForEvent("download"), summary.click()]);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const content = await readFile(downloadPath!, "utf8");
  const header = content.replace(/^\uFEFF/, "").split("\n")[0] ?? "";

  expect(header).toContain("month,status,income");
  expect(header).toContain("shared,household,total_spent,savings");
  expect(download.suggestedFilename()).toMatch(/year-summary\.csv$/);
});

test("unknown export kind is rejected", async ({ request }) => {
  const response = await request.get("/api/reports/export?kind=transactions");
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ error: "Unknown export kind." });
});
