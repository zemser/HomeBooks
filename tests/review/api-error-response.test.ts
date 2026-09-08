import assert from "node:assert/strict";
import test from "node:test";

import { notFound, redirect } from "next/navigation";

import { errorResponse } from "../../src/lib/logging/server";

function thrown(callback: () => never) {
  try {
    callback();
  } catch (error) {
    return error;
  }

  throw new Error("expected callback to throw");
}

test("errorResponse rethrows Next.js redirect control-flow errors", () => {
  const error = thrown(() => redirect("/sign-in"));
  assert.throws(
    () =>
      errorResponse({
        error,
        message: "Failed to export report",
        route: "/api/reports/export",
        clientMessage: "Failed to export report.",
      }),
    (caught: unknown) => caught === error,
  );
});

test("errorResponse rethrows Next.js notFound control-flow errors", () => {
  const error = thrown(() => notFound());
  assert.throws(
    () =>
      errorResponse({
        error,
        message: "Failed to export report",
        route: "/api/reports/export",
        clientMessage: "Failed to export report.",
      }),
    (caught: unknown) => caught === error,
  );
});

test("errorResponse still returns JSON for ordinary failures", async () => {
  const messages: string[] = [];
  const originalError = console.error;
  console.error = (message: string) => messages.push(message);

  try {
    const response = errorResponse({
      error: new Error("boom"),
      message: "Failed to export report",
      route: "/api/reports/export",
      clientMessage: "Failed to export report.",
    });

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Failed to export report." });
    assert.equal(messages.length, 1);
  } finally {
    console.error = originalError;
  }
});
