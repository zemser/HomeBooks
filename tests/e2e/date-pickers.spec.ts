import { expect, test } from "@playwright/test";
import axe from "axe-core";

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`date controls at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("month keyboard selection, bounds, dismissal, and All months", async ({
      page,
    }) => {
      await page.goto("/transactions/all?month=2026-05");
      const trigger = page.getByRole("button", {
        name: "Jump to month, May 2026",
        exact: true,
      });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const picker = page.getByRole("dialog", {
        name: "Jump to month",
        exact: true,
      });
      const may = picker.getByRole("option", { name: "May 2026", exact: true });
      await expect(may).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(
        picker.getByRole("option", { name: "June 2026", exact: true }),
      ).toBeFocused();
      await expect(page).toHaveURL(/month=2026-05/);
      await page.keyboard.press("Enter");
      await expect(picker).toBeHidden();
      await expect(page).toHaveURL(/month=2026-06/);
      const juneTrigger = page.getByRole("button", {
        name: "Jump to month, June 2026",
        exact: true,
      });
      await expect(juneTrigger).toBeFocused();
      await juneTrigger.click();
      const box = await picker.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      await page.keyboard.press("Escape");
      await expect(juneTrigger).toBeFocused();
      await page
        .getByRole("button", { name: "All months", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Jump to month, All months", exact: true })
        .click();
      await expect(picker.getByRole("option", { selected: true })).toHaveCount(
        0,
      );
      await picker.getByRole("button", { name: "Previous year" }).click();
      await expect(picker.getByRole("listbox")).toHaveAccessibleName(
        /Months in \d{4}/,
      );
      await page.keyboard.press("Escape");
    });

    test("GET forms submit the selected YYYY-MM value", async ({ page }) => {
      for (const [route, submit] of [
        ["/?month=2026-05", "Load month"],
        ["/reports?month=2026-05", "Load report"],
        ["/reports?view=year&month=2026-05", "Load year"],
      ]) {
        await page.goto(route);
        await page
          .getByRole("button", {
            name: /^(Selected month|Year through month), May 2026$/,
          })
          .click();
        await page
          .getByRole("option", { name: "April 2026", exact: true })
          .click();
        await page.getByRole("button", { name: submit, exact: true }).click();
        await expect(page).toHaveURL(/month=2026-04/);
        await expect(
          page.getByRole("button", {
            name: /^(Selected month|Year through month), April 2026$/,
          }),
        ).toBeVisible();
      }
    });

    test("calendar works inside the entry modal and submits a date-only value", async ({
      page,
    }) => {
      await page.goto("/transactions/all?month=2026-05");
      await page
        .getByRole("button", { name: "Add expense or income", exact: true })
        .click();
      const modal = page.getByRole("dialog", {
        name: "Add expense or income",
        exact: true,
      });
      await modal
        .getByRole("textbox", { name: "Title", exact: true })
        .fill("Calendar verification");
      await modal
        .getByRole("spinbutton", { name: "Amount", exact: true })
        .fill("10");
      const chooseDate = modal.getByRole("button", { name: /Choose date/ });
      await chooseDate.click();
      const calendar = page.getByRole("dialog", { name: "Date", exact: true });
      await expect(calendar).toBeVisible();
      await page.addScriptTag({ content: axe.source });
      const violations = await page.evaluate(async () => {
        const result = await (
          window as typeof window & { axe: typeof axe }
        ).axe.run(".date-picker-popover");
        return result.violations.filter(
          (v) => v.impact === "serious" || v.impact === "critical",
        );
      });
      expect(violations).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(calendar).toBeHidden();
      await expect(modal).toBeVisible();
      await expect(chooseDate).toBeFocused();
      // Exercise segmented typing before using the calendar, including a leap day.
      for (const [segment, value] of [
        ["year", "2024"],
        ["month", "2"],
        ["day", "29"],
      ]) {
        const field = modal.getByRole("spinbutton", {
          name: `${segment}, Date`,
          exact: true,
        });
        await field.focus();
        await page.keyboard.type(value);
      }
      await page.keyboard.press("Tab");
      await chooseDate.click();
      await expect(
        calendar.getByRole("button", { name: /Thursday, 29 February 2024/ }),
      ).toBeVisible();
      await calendar
        .getByRole("button", { name: /Thursday, 29 February 2024/ })
        .click();
      await expect(calendar).toBeHidden();
      await page.route("**/api/manual-entries", async (route) => {
        expect(route.request().postDataJSON().eventDate).toBe("2024-02-29");
        await route.fulfill({
          status: 400,
          json: { error: "Verification only; no entry saved." },
        });
      });
      const request = page.waitForRequest(
        (request) =>
          request.url().endsWith("/api/manual-entries") &&
          request.method() === "POST",
      );
      await modal
        .getByRole("button", { name: "Save and show in this month" })
        .click();
      expect((await request).postDataJSON().eventDate).toBe("2024-02-29");
    });
  });
}


test("history month bounds disable unavailable months and years", async ({ page, request }) => {
  const response = await request.get("/api/expenses?month=all");
  expect(response.ok()).toBeTruthy();
  const { filterOptions } = await response.json();
  const earliest = [...filterOptions.months].sort()[0] as string | undefined;
  test.skip(!earliest, "Requires at least one transaction month");
  await page.goto(`/transactions/all?month=${earliest}`);
  await page.getByRole("button", { name: /^Jump to month,/ }).click();
  const picker = page.getByRole("dialog", { name: "Jump to month", exact: true });
  await expect(picker.getByRole("button", { name: "Previous year" })).toBeDisabled();
  const options = picker.getByRole("option");
  for (let month = 1; month < Number(earliest!.slice(5, 7)); month += 1) {
    await expect(options.nth(month - 1)).toHaveAttribute("aria-disabled", "true");
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "All months", exact: true }).click();
  await page.getByRole("button", { name: "Jump to month, All months", exact: true }).click();
  await expect(picker.getByRole("button", { name: "Next year" })).toBeDisabled();
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await (window as typeof window & { axe: typeof axe }).axe.run(".date-picker-popover");
    return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  });
  expect(violations).toEqual([]);
});
