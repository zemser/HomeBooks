import assert from "node:assert/strict";
import test from "node:test";

import { getMonthCompletenessPresentation } from "../../src/features/reporting/presentation";

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
