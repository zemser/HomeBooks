import type { ReviewQueueImportSummary } from "@/features/expenses/types";

export const STATEMENT_BROWSER_MIN_COUNT = 7;

const unknownPeriod = "Unknown period";
const unknownSource = "Unknown source";

export function statementSwitcherMode(count: number): "hidden" | "menu" | "browser" {
  if (count < 2) return "hidden";
  if (count >= STATEMENT_BROWSER_MIN_COUNT) return "browser";
  return "menu";
}

export function statementPeriodLabel(item: Pick<ReviewQueueImportSummary, "earliestTransactionDate" | "latestTransactionDate">) {
  if (!item.earliestTransactionDate || !item.latestTransactionDate) return unknownPeriod;

  const earliest = item.earliestTransactionDate.slice(0, 7);
  const latest = item.latestTransactionDate.slice(0, 7);
  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  if (earliest === latest) return formatter.format(new Date(`${earliest}-01T00:00:00.000Z`));

  return `${formatter.format(new Date(`${earliest}-01T00:00:00.000Z`))} to ${formatter.format(
    new Date(`${latest}-01T00:00:00.000Z`),
  )}`;
}

export function statementSourceName(item: Pick<ReviewQueueImportSummary, "sourceName">) {
  return item.sourceName?.trim() || unknownSource;
}

export function statementOptionTitle(item: Pick<ReviewQueueImportSummary, "originalFilename" | "earliestTransactionDate" | "latestTransactionDate">) {
  const period = statementPeriodLabel(item);
  return period === unknownPeriod ? item.originalFilename : period;
}

export function statementProgressPercent(item: Pick<ReviewQueueImportSummary, "totalCount" | "reviewedCount">) {
  if (item.totalCount <= 0) return 0;
  return Math.min(100, Math.round((item.reviewedCount / item.totalCount) * 100));
}

export function statementRowSubtitle(item: Pick<ReviewQueueImportSummary, "remainingCount" | "reviewedCount">) {
  if (item.remainingCount <= 0) return `Complete · ${item.reviewedCount} handled`;
  return `${item.remainingCount} left · ${item.reviewedCount} handled`;
}

export function statementOptionLabel(item: ReviewQueueImportSummary) {
  const title = statementOptionTitle(item);
  const filename = title === item.originalFilename ? null : item.originalFilename;
  return [statementSourceName(item), title, statementRowSubtitle(item), filename].filter(Boolean).join(", ");
}

export function statementSwitcherTriggerLabel(statements: ReviewQueueImportSummary[], selectedImportId: string) {
  const selected = statements.find((item) => item.importId === selectedImportId);
  if (!selected) return `${statements.length} statements`;
  return statementOptionTitle(selected);
}

export function statementMatchesQuery(item: ReviewQueueImportSummary, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [
    item.originalFilename,
    item.sourceName ?? "",
    statementPeriodLabel(item),
    item.earliestTransactionDate ?? "",
    item.latestTransactionDate ?? "",
  ]
    .join("\n")
    .toLocaleLowerCase()
    .includes(normalized);
}

export function filterStatements(statements: ReviewQueueImportSummary[], query: string) {
  return statements.filter((item) => statementMatchesQuery(item, query));
}

function compareStatementsByNewest(left: ReviewQueueImportSummary, right: ReviewQueueImportSummary) {
  const leftDate = left.latestTransactionDate ?? left.earliestTransactionDate ?? "";
  const rightDate = right.latestTransactionDate ?? right.earliestTransactionDate ?? "";
  const byDate = rightDate.localeCompare(leftDate);
  if (byDate !== 0) return byDate;
  return left.originalFilename.localeCompare(right.originalFilename);
}

export function partitionStatements(statements: ReviewQueueImportSummary[]) {
  const active: ReviewQueueImportSummary[] = [];
  const complete: ReviewQueueImportSummary[] = [];
  for (const item of statements) {
    if (item.remainingCount > 0) active.push(item);
    else complete.push(item);
  }
  active.sort(compareStatementsByNewest);
  complete.sort(compareStatementsByNewest);
  return { active, complete };
}

export function groupStatementsBySource(statements: ReviewQueueImportSummary[]) {
  const groups = new Map<string, ReviewQueueImportSummary[]>();
  for (const item of statements) {
    const source = statementSourceName(item);
    const list = groups.get(source);
    if (list) list.push(item);
    else groups.set(source, [item]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === unknownSource) return 1;
      if (right === unknownSource) return -1;
      return left.localeCompare(right);
    })
    .map(([source, items]) => ({
      source,
      statements: items.sort(compareStatementsByNewest),
    }));
}
