import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { POST } from "../../src/app/api/mcp/route";
import { compareReports, comparisonMonths, itemsArgs, listItems } from "../../src/features/mcp/reports";
import type { MonthlyReportData, MonthlyReportLineItem } from "../../src/features/reporting/monthly-report";

test("MCP requires its dedicated token and advertises only read-only tools", async t => {
  const token = randomBytes(32).toString("hex");
  const env = { FINAPP_MCP_USER_ID: "user", FINAPP_MCP_WORKSPACE_ID: "workspace",
    FINAPP_MCP_TOKEN_SHA256: createHash("sha256").update(token).digest("hex") };
  for (const [key, value] of Object.entries(env)) {
    const original = process.env[key];
    t.after(() => { if (original === undefined) delete process.env[key]; else process.env[key] = original; });
    process.env[key] = value;
  }
  const call = (method: string, params = {}, headers = {}, id: number | null = 1) =>
    POST(new Request("https://homebooks.example/api/mcp", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", ...(id === null ? {} : { id }), method, params }),
    }));
  assert.equal((await call("tools/list", {}, { authorization: "" })).status, 401);
  assert.equal((await call("tools/list", {}, { authorization: "Bearer incorrect" })).status, 401);
  assert.equal((await call("tools/list", {}, { origin: "https://elsewhere.example" })).status, 403);
  const init = await (await call("initialize", { protocolVersion: "2025-06-18" })).json();
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.equal((await call("notifications/initialized", {}, {}, null)).status, 202);
  const response = await call("tools/list");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const { result } = await response.json();
  assert.deepEqual(result.tools.map((tool: { name: string }) => tool.name), ["compare_months", "list_report_items"]);
  assert.ok(result.tools.every((tool: { annotations: { readOnlyHint: boolean } }) => tool.annotations.readOnlyHint));
  assert.deepEqual(result.tools[1].inputSchema.required, ["month"]);
  for (const args of [{ month: "2026-13" }, { workspaceId: "other" }]) {
    const invalid = await (await call("tools/call", { name: "compare_months", arguments: args })).json();
    assert.equal(invalid.result.isError, true);
    assert.doesNotMatch(invalid.result.content[0].text, /database connection/);
  }
  assert.equal((await (await call("tools/call", { name: "delete_transaction" })).json()).error.code, -32602);
  delete process.env.FINAPP_MCP_TOKEN_SHA256;
  assert.equal((await call("tools/list")).status, 404);
});

function sampleReport(month: string, category: string, spend: number): MonthlyReportData {
  return {
    summary: { selectedMonth: month + "-01", reportingMode: "payment_date", workspaceCurrency: "ILS",
      incomeTotal: 0, expenseTotal: spend, savingsTotal: -spend, importedTransactionCount: 2, manualEntryCount: 0 },
    completeness: { month, status: "in_progress", importedTransactionCount: 2, reviewedTransactionCount: 1,
      pendingTransactionCount: 1, reportableTransactionCount: 1, excludedTransactionCount: 0, manualEntryCount: 0 },
    categoryScopeBreakdown: [{ categoryId: null, category, expenseTotal: spend, amounts: [], itemCount: 1 }],
    sliceMetadata: { members: [], categories: [] }, spendingScopes: [], memberIncome: [], categoryBreakdown: [],
    memberBreakdown: [], lineItems: [],
  };
}

test("December rollover, closed and new categories, decimals and review state", () => {
  assert.deepEqual(comparisonMonths("2026-01"), { previous: "2025-12", current: "2026-01" });
  const diff = compareReports(sampleReport("2025-12", "Dining", 0.1), sampleReport("2026-01", "Housing", 0.3));
  assert.equal(diff.change.spending, 0.2);
  assert.equal(diff.current.completeness.pendingTransactionCount, 1);
  assert.deepEqual(diff.spendingByCategory.map(c => [c.categoryKey, c.change]), [
    ["uncatalogued:Housing", 0.3], ["uncatalogued:Dining", -0.1],
  ]);
});

test("category evidence preserves allocation amount, source-month link and stable paging", () => {
  const report = sampleReport("2026-06", "Housing", 30);
  const row: MonthlyReportLineItem = {
    id: "b", sourceKind: "imported_transaction", sourceRecordId: "tx", sourceEventDate: "2026-08-15",
    sourceNormalizedAmount: 60, title: "Bill", eventDate: "2026-06-01", direction: "expense", normalizedAmount: 30,
    workspaceCurrency: "ILS", classificationType: "shared", category: "Housing", categoryId: null, memberId: null,
    memberName: null, personalOwnerName: null, paidByName: null, receivedByName: null, fxDetails: null,
  };
  report.lineItems = [row, { ...row, id: "a", sourceKind: "one_time_manual" },
    { ...row, id: "c", category: "Dining" }, { ...row, id: "d", direction: "income", classificationType: "income" }];
  const args = itemsArgs.parse({ month: "2026-06", mode: "allocated_period", categoryKey: "uncatalogued:Housing", limit: 1 });
  const first = listItems(report, args);
  assert.equal(first.totalRows, 2);
  assert.equal(first.items[0].id, "a");
  assert.equal(first.items[0].historyPath, null);
  const last = listItems(report, { ...args, offset: first.nextOffset! });
  assert.equal(last.nextOffset, null);
  assert.equal(last.items[0].amount, 30);
  assert.equal(last.items[0].historyPath, "/transactions/all?transactionId=tx&month=2026-08");
});
