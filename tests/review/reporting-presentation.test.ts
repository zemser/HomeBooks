import assert from "node:assert/strict";
import test from "node:test";

import { getMonthCompletenessPresentation, getMonthCompletenessNextAction, getMonthCompletenessProgressCopy } from "../../src/features/reporting/presentation";

test("month completeness presentation keeps every status visually distinct", () => {
  assert.deepEqual(getMonthCompletenessPresentation("empty"), {
    label: "Empty",
    tone: "neutral",
  });
  assert.deepEqual(getMonthCompletenessPresentation("in_progress"), {
    label: "In progress",
    tone: "warning",
  });
  assert.deepEqual(getMonthCompletenessPresentation("complete"), {
    label: "Complete",
    tone: "success",
  });
});

const classifiedWithoutPayer = {
  status: "in_progress" as const,
  pendingTransactionCount: 0,
  unresolvedAttributionCount: 2,
  importedTransactionCount: 5,
  reviewedTransactionCount: 5,
};

test("an incomplete month with no review queue leftover sends people confirmation to History", () => {
  assert.deepEqual(
    getMonthCompletenessNextAction(classifiedWithoutPayer, "2026-09-01"),
    {
      href: "/transactions/all?month=2026-09&import=all",
      label: "Confirm people on 2 transactions",
    },
  );
  assert.match(
    getMonthCompletenessProgressCopy(classifiedWithoutPayer),
    /classified, but 2 classified transactions still need payer/,
  );
});

test("unclassified leftovers still send the user to Review", () => {
  assert.deepEqual(
    getMonthCompletenessNextAction(
      {
        status: "in_progress",
        pendingTransactionCount: 1,
        unresolvedAttributionCount: 2,
        importedTransactionCount: 5,
        reviewedTransactionCount: 4,
      },
      "2026-09-01",
    ),
    {
      href: "/transactions/review?month=2026-09",
      label: "Review 1 transaction",
    },
  );
});
