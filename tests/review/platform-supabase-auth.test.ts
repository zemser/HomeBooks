import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAal2Claims,
  AuthContextError,
} from "../../src/features/auth/supabase-user";

test("missing verified claims are rejected as unauthenticated", () => {
  assert.throws(
    () => assertAal2Claims(null),
    (error: unknown) => error instanceof AuthContextError && error.status === 401,
  );
});

test("aal1 claims are rejected by the shared server authorization contract", () => {
  assert.throws(
    () => assertAal2Claims({ sub: "user-1", aal: "aal1" }),
    (error: unknown) => error instanceof AuthContextError && error.status === 403,
  );
});

test("aal2 claims pass the shared server authorization contract", () => {
  assert.doesNotThrow(() => assertAal2Claims({ sub: "user-1", aal: "aal2" }));
});
