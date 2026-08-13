import { expect, test } from "@playwright/test";
import { instant } from "@next/playwright";

const routes = [
  { name: "home", href: "/", source: "/imports", shell: "home-shell", content: "home-content" },
  { name: "review", href: "/imports/review", source: "/", shell: "review-shell", content: "review-content" },
  { name: "expenses", href: "/expenses", source: "/", shell: "expenses-shell", content: "expenses-content" },
  { name: "reports", href: "/reports", source: "/", shell: "reports-shell", content: "reports-content" },
  { name: "settings", href: "/settings", source: "/", shell: "settings-shell", content: "settings-content" },
  { name: "recurring", href: "/recurring", source: "/", shell: "recurring-shell", content: "recurring-content" },
  { name: "settlements", href: "/settlements", source: "/", shell: "settlements-shell", content: "settlements-content" },
  { name: "imports", href: "/imports", source: "/", shell: "imports-shell", content: "imports-content" },
  { name: "investments", href: "/investments", source: "/", shell: "investments-shell", content: "investments-content" },
] as const;

for (const route of routes) {
  test(`${route.name} serves its shell on an initial load`, async ({ page, baseURL }) => {
    if (!baseURL) throw new Error("The instant-navigation rig requires a baseURL.");

    await instant(
      page,
      async () => {
        await page.goto(route.href);
        await expect(page.getByTestId(route.shell)).toBeVisible();
        await expect(page.getByTestId(route.content)).toHaveCount(0);
      },
      { baseURL },
    );
  });

  test(`${route.name} commits its shell on a client navigation`, async ({ page }) => {
    await page.goto(route.source);
    await expect(page.getByTestId("app-shell")).toBeVisible();
    const trigger = page.locator(`a[href="${route.href}"]`).filter({ visible: true }).first();
    await expect(trigger).toBeVisible();

    await instant(page, async () => {
      await trigger.click();
      await page.waitForURL((url) => url.pathname === route.href);
      await expect(page.getByTestId(route.shell)).toBeVisible();
      await expect(page.getByTestId(route.content)).toHaveCount(0);
    });

    await expect(page.getByTestId(route.content)).toBeVisible();
  });
}
