import assert from "node:assert/strict";
import test from "node:test";

import {
  displayNameFromEmail,
  getPasswordValidationError,
} from "../../src/features/auth/password";

test("password validation requires length and mixed case with a number", () => {
  assert.equal(getPasswordValidationError("short"), "Password must be at least 10 characters.");
  assert.equal(
    getPasswordValidationError("alllowercase1"),
    "Password must include uppercase, lowercase, and a number.",
  );
  assert.equal(getPasswordValidationError("ValidPass1word"), null);
});

test("email signup derives a display name from the local part", () => {
  assert.equal(displayNameFromEmail("lee@example.com"), "lee");
  assert.equal(displayNameFromEmail("@example.com"), "Household member");
});
