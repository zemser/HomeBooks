import { expect, test, type Page } from "@playwright/test";

const tabs = [
  { label: "Import", path: "/transactions" },
  { label: "Review", path: "/transactions/review" },
  { label: "History", path: "/transactions/all" },
] as const;

async function readHeaderBoxes(page: Page) {
  return page.evaluate(() => {
    const title = document.querySelector('[data-testid="transactions-shell"] h1');
    const nav = document.querySelector('nav[aria-label="Transactions workflow"]');
    if (!(title instanceof HTMLElement) || !(nav instanceof HTMLElement)) return null;

    const round = (box: DOMRect) => ({
      top: Math.round(box.top),
      left: Math.round(box.left),
      width: Math.round(box.width),
      height: Math.round(box.height),
    });
    return { title: round(title.getBoundingClientRect()), nav: round(nav.getBoundingClientRect()) };
  });
}

async function openTab(page: Page, tab: (typeof tabs)[number]) {
  const workflow = page.getByRole("navigation", { name: "Transactions workflow" });
  await workflow.getByRole("link", { name: new RegExp(`^${tab.label}`) }).click();
  await expect(page).toHaveURL(new RegExp(`${tab.path.replace(/\//g, "\\/")}(\\?|$)`));
  await expect(workflow.getByRole("link", { name: new RegExp(`^${tab.label}`) }))
    .toHaveAttribute("aria-current", "page");
}

test.describe("compact Transactions header", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("title and workflow tabs share one row on every tab", async ({ page }) => {
    for (const tab of tabs) {
      await page.goto(tab.path);
      const boxes = await readHeaderBoxes(page);
      expect(boxes, tab.path).toBeTruthy();

      const { title, nav } = boxes!;
      expect(nav.top, tab.path).toBeLessThan(title.top + title.height);
      expect(title.top, tab.path).toBeLessThan(nav.top + nav.height);
      expect(nav.left, tab.path).toBeGreaterThan(title.left + title.width);
    }
  });

  test("switching tabs does not move or resize the title or tabs", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page.getByTestId("transactions-import-content")).toBeVisible();
    const baseline = await readHeaderBoxes(page);
    expect(baseline).toBeTruthy();

    for (const tab of [tabs[1], tabs[2], tabs[1], tabs[0]]) {
      await openTab(page, tab);
      await expect.poll(() => readHeaderBoxes(page), { message: tab.path }).toEqual(baseline);
    }
  });
});

test.describe("compact Transactions header on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("tabs span the row and stay put across tabs", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page.getByTestId("transactions-import-content")).toBeVisible();
    const baseline = await readHeaderBoxes(page);
    expect(baseline).toBeTruthy();

    const shellWidth = await page.getByTestId("transactions-shell").evaluate(
      (header) => header.parentElement?.clientWidth ?? 0,
    );
    expect(baseline!.nav.width).toBeGreaterThan(shellWidth * 0.8);

    for (const tab of [tabs[1], tabs[2], tabs[0]]) {
      await openTab(page, tab);
      await expect.poll(() => readHeaderBoxes(page), { message: tab.path }).toEqual(baseline);
    }
  });
});

test.describe("non-Review pages keep document scroll", () => {
  test.use({ viewport: { width: 1280, height: 560 } });

  for (const [route, ready] of [
    ["/transactions/all", '[data-testid="transactions-all-content"] .data-table'],
    ["/reports", ".data-table"],
  ] as const) {
    test(`${route} grows the page scrollport`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator(ready).first()).toBeAttached();
      await expect.poll(() => page.evaluate(() => {
        const scrollport = document.querySelector(".app-main-scroll");
        return scrollport instanceof HTMLElement
          && scrollport.getBoundingClientRect().height > window.innerHeight + 1;
      })).toBe(true);

      const metrics = await page.evaluate(() => {
        const shell = document.querySelector(".app-shell");
        const scrollport = document.querySelector(".app-main-scroll");
        const documentScroller = document.scrollingElement;
        if (
          !(shell instanceof HTMLElement)
          || !(scrollport instanceof HTMLElement)
          || !(documentScroller instanceof HTMLElement)
        ) return null;

        const clippedTables = [...document.querySelectorAll(".table-wrap")]
          .filter((wrap) => wrap.scrollHeight > wrap.clientHeight + 1).length;
        const before = documentScroller.scrollTop;
        documentScroller.scrollTop = 200;
        return {
          shellOverflow: getComputedStyle(shell).overflow,
          scrollportOverflowX: getComputedStyle(scrollport).overflowX,
          scrolled: documentScroller.scrollTop > before,
          clippedTables,
          lockedWorkspaces: document.querySelectorAll(".review-workspace-locked").length,
        };
      });

      expect(metrics).toBeTruthy();
      expect(metrics!.shellOverflow).toBe("visible");
      expect(metrics!.scrollportOverflowX).toBe("hidden");
      expect(metrics!.lockedWorkspaces).toBe(0);
      expect(metrics!.clippedTables).toBe(0);
      expect(metrics!.scrolled).toBe(true);
    });
  }
});
