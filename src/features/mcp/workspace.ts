import { and, eq, sql } from "drizzle-orm";
import { withDbTransaction } from "@/db";
import { workspaceMembers, workspaces } from "@/db/schema";
import { getMonthlyReport } from "@/features/reporting/monthly-report";
import { compareArgs, compareReports, comparisonMonths, itemsArgs, listItems } from "./reports";

type ReportToolCall =
  | { name: "compare_months"; args: ReturnType<typeof compareArgs.parse> }
  | { name: "list_report_items"; args: ReturnType<typeof itemsArgs.parse> };

export async function runReportTool(request: ReportToolCall, userId: string, workspaceId: string) {
  return withDbTransaction(userId, async db => {
    const security = await db.execute(sql`select row_security_active('public.workspace_members') as active`);
    if (security.rows[0]?.active !== true) throw new Error("Workspace RLS is required");
    const [context] = await db.select({
      userId: workspaceMembers.userId, memberId: workspaceMembers.id,
      workspaceId: workspaces.id, baseCurrency: workspaces.baseCurrency,
    }).from(workspaceMembers).innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.isActive, true))).limit(1);
    if (!context) throw new Error("Membership unavailable");
    if (request.name === "list_report_items") {
      return listItems(await getMonthlyReport(context, request.args, db), request.args);
    }
    const months = comparisonMonths(request.args.month);
    const previous = await getMonthlyReport(context, { month: months.previous, mode: request.args.mode }, db);
    const current = await getMonthlyReport(context, { month: months.current, mode: request.args.mode }, db);
    return compareReports(previous, current);
  }, {
    readOnly: true,
    connectionString: process.env.FINAPP_MCP_DATABASE_URL,
    ca: process.env.FINAPP_MCP_DATABASE_CA,
  });
}
