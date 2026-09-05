import { expect, test } from "@playwright/test";
import { instant } from "@next/playwright";

const routes = [
  { name: "home", href: "/", source: "/transactions", shell: "home-shell", content: "home-content" },
  {
    name: "transaction import",
    href: "/transactions",
    source: "/",
    shell: "transactions-shell",
    content: "transactions-import-content",
  },
  {
    name: "transaction review",
    href: "/transactions/review",
    source: "/transactions",
    shell: "transactions-shell",
    content: "transactions-review-content",
  },
  {
    name: "all transactions",
    href: "/transactions/all",
    source: "/transactions",
    shell: "transactions-shell",
    content: "transactions-all-content",
  },
  { name: "reports", href: "/reports", source: "/", shell: "reports-shell", content: "reports-content" },
  { name: "settings", href: "/settings", source: "/more", shell: "settings-shell", content: "settings-content" },
  { name: "recurring", href: "/recurring", source: "/more", shell: "recurring-shell", content: "recurring-content" },
  { name: "settlements", href: "/settlements", source: "/more", shell: "settlements-shell", content: "settlements-content" },
  { name: "investments", href: "/investments", source: "/more", shell: "investments-shell", content: "investments-content" },
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

test("More serves its shell on an initial load", async ({ page, baseURL }) => {
  if (!baseURL) throw new Error("The instant-navigation rig requires a baseURL.");

  await instant(
    page,
    async () => {
      await page.goto("/more");
      await expect(page.getByTestId("more-shell")).toBeVisible();
    },
    { baseURL },
  );
});

test("More commits its shell from the mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("navigation", { name: "Primary mobile navigation" })
    .getByRole("link", { name: "More", exact: true });

  await instant(page, async () => {
    await trigger.click();
    await page.waitForURL((url) => url.pathname === "/more");
    await expect(page.getByTestId("more-shell")).toBeVisible();
  });
});
