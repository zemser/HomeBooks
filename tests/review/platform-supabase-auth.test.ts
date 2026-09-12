import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAuthenticatedClaims,
  AuthContextError,
} from "../../src/features/auth/supabase-user";

test("missing verified claims are rejected as unauthenticated", () => {
  assert.throws(
    () => assertAuthenticatedClaims(null),
    (error: unknown) => error instanceof AuthContextError && error.status === 401,
  );
});

test("aal1 claims pass the shared server authorization contract", () => {
  assert.doesNotThrow(() => assertAuthenticatedClaims({ sub: "user-1", aal: "aal1" }));
});

test("aal2 claims pass the shared server authorization contract", () => {
  assert.doesNotThrow(() => assertAuthenticatedClaims({ sub: "user-1", aal: "aal2" }));
});
