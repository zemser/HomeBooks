import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

test("year view year-summary link downloads a CSV with the machine header", async ({ page }) => {
  const prerenderErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /unstable value|blocking-prerender/.test(message.text())) {
      prerenderErrors.push(message.text());
    }
  });
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
  expect(prerenderErrors).toEqual([]);
});

test("unknown export kind is rejected", async ({ request }) => {
  const response = await request.get("/api/reports/export?kind=transactions");
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ error: "Unknown export kind." });
});

for (const month of ["garbage", "2026-13", "2026-02-30"]) {
  test(`invalid export month ${month} returns 400`, async ({ request }) => {
    const response = await request.get(`/api/reports/export?kind=year_summary&month=${month}`);
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: "Month must use YYYY-MM or YYYY-MM-01." });
  });
}

test("exports use payment dates or allocation months according to the selected UI mode", async ({ page, request }) => {
  test.setTimeout(60_000);
  const modes = ["payment_date", "allocated_period"] as const;
  const year = new Date().getFullYear() - 1;
  const january = `${year}-01`;
  const february = `${year}-02`;

  async function readExports(mode: typeof modes[number]) {
    const tables: Record<string, string[][]> = {};
    for (const kind of ["year_summary", "category_detail", "workbook"]) {
      const response = await request.get(`/api/reports/export?kind=${kind}&month=${february}&mode=${mode}`);
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toBe("no-store");
      expect(response.headers()["content-disposition"]).toMatch(new RegExp(`${mode.replaceAll("_", "-")}-[A-Z]{3}`));
      if (kind === "workbook") {
        const workbook = XLSX.read(await response.body(), { type: "buffer" });
        expect(workbook.SheetNames).toEqual(["Year Summary", "Category Detail"]);
        for (const [index, tableKind] of ["year_summary", "category_detail"].entries()) {
          const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[index]!]!, { header: 1 });
          expect(rows.map((row) => row.map(String))).toEqual(tables[tableKind]);
        }
      } else {
        tables[kind] = parse(await response.text(), { bom: true });
      }
    }
    return tables;
  }

  function spending(rows: string[][], month: string) {
    const monthIndex = rows[0]!.indexOf("month");
    const spentIndex = rows[0]!.indexOf("total_spent");
    return rows.slice(2).filter((row) => row[monthIndex] === month)
      .reduce((sum, row) => sum + Number(row[spentIndex]), 0);
  }

  const baseline = {
    payment_date: await readExports("payment_date"),
    allocated_period: await readExports("allocated_period"),
  };
  const created = await request.post("/api/manual-entries", {
    data: {
      title: "Export reporting-mode regression fixture",
      eventKind: "expense", classificationType: "household",
      amount: 90, eventDate: `${february}-15`,
    },
  });
  expect(created.status()).toBe(201);
  const { manualEntryId } = await created.json();
  try {
    const allocated = await request.post("/api/transaction-allocations", {
      data: {
        sourceType: "manual", sourceId: manualEntryId,
        reportingMode: "allocated_period", allocationStrategy: "manual_split",
        allocations: [
          { reportMonth: `${january}-01`, allocatedAmount: "30" },
          { reportMonth: `${february}-01`, allocatedAmount: "60" },
        ],
      },
    });
    expect(allocated.status()).toBe(200);
    for (const mode of modes) {
      await page.goto(`/reports?view=year&month=${february}&mode=${mode}`);
      const link = page.getByRole("link", { name: "Download year summary" });
      await expect(link).toHaveAttribute("href", `/api/reports/export?kind=year_summary&month=${february}&mode=${mode}`);
      const tables = await readExports(mode);
      for (const kind of ["year_summary", "category_detail"]) {
        expect(spending(tables[kind]!, january) - spending(baseline[mode][kind]!, january))
          .toBeCloseTo(mode === "payment_date" ? 0 : 30, 2);
        expect(spending(tables[kind]!, february) - spending(baseline[mode][kind]!, february))
          .toBeCloseTo(mode === "payment_date" ? 90 : 60, 2);
      }
    }
  } finally {
    const deleted = await request.delete(`/api/manual-entries/${manualEntryId}`);
    expect(deleted.status()).toBe(200);
  }
});
