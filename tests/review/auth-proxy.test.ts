import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { proxy } from "../../src/proxy";

function sessionCookie(aal: "aal1" | "aal2") {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: "user-1", aal, exp: expiresAt,
  })}.${Buffer.from("test-signature").toString("base64url")}`;
  return `sb-test-auth-token=base64-${encode({
    access_token: accessToken,
    refresh_token: "test-refresh-token",
    expires_at: expiresAt,
    expires_in: 3600,
    token_type: "bearer",
    user: { id: "user-1" },
  })}`;
}

test("hosted proxy accepts ordinary sign-in while keeping anonymous requests blocked", async (t) => {
  const previous = { ...process.env };
  process.env.FINAPP_AUTH_MODE = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  // HS256 claims are verified by Supabase's user endpoint, which this test stubs.
  t.mock.method(globalThis, "fetch", async () => Response.json({
    id: "user-1", aud: "authenticated", role: "authenticated",
  }));
  t.after(() => {
    for (const key of ["FINAPP_AUTH_MODE", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  for (const aal of ["aal1", "aal2"] as const) {
    for (const path of ["/reports", "/onboarding", "/api/investments/preview", "/api/workspace-invites/invite-1/accept"]) {
      await t.test(`${aal} can access ${path}`, async () => {
        const response = await proxy(new NextRequest(`http://localhost${path}`, {
          headers: { cookie: sessionCookie(aal) },
        }));
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("location"), null);
        assert.equal(response.headers.get("x-middleware-next"), "1");
      });
    }
  }

  await t.test("anonymous pages go to sign-in and preserve their destination", async () => {
    const response = await proxy(new NextRequest("http://localhost/reports?month=2026-10"));
    const destination = new URL(response.headers.get("location")!);
    assert.equal(destination.pathname, "/sign-in");
    assert.equal(destination.searchParams.get("next"), "/reports?month=2026-10");
  });
  await t.test("anonymous APIs still return 401", async () => {
    const response = await proxy(new NextRequest("http://localhost/api/investments/preview"));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Authentication required." });
  });
});
