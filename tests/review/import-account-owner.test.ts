import assert from "node:assert/strict";
import test from "node:test";
import { resolveImportAccountOwnerMemberId } from "../../src/features/imports/persistence";

test("a new account defaults to the member who is importing the file", () => {
  assert.equal(
    resolveImportAccountOwnerMemberId({
      hasExistingAccount: false,
      currentMemberId: "lee",
    }),
    "lee",
  );
});

test("an existing account keeps its saved owner instead of the uploader", () => {
  assert.equal(
    resolveImportAccountOwnerMemberId({
      hasExistingAccount: true,
      existingOwnerMemberId: "sam",
      currentMemberId: "lee",
    }),
    "sam",
  );
});

test("an existing joint account stays unassigned", () => {
  assert.equal(
    resolveImportAccountOwnerMemberId({
      hasExistingAccount: true,
      existingOwnerMemberId: null,
      currentMemberId: "lee",
    }),
    null,
  );
});

test("an explicit import choice wins over the uploader default", () => {
  assert.equal(
    resolveImportAccountOwnerMemberId({
      requestedAccountOwnerMemberId: "sam",
      hasExistingAccount: false,
      currentMemberId: "lee",
    }),
    "sam",
  );
  assert.equal(
    resolveImportAccountOwnerMemberId({
      requestedAccountOwnerMemberId: null,
      hasExistingAccount: false,
      currentMemberId: "lee",
    }),
    null,
  );
});
