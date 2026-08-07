import type { JwtPayload, User } from "@supabase/supabase-js";
import { cache } from "react";

import { clearCurrentDatabaseUserId, setCurrentDatabaseUserId } from "@/db/request-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAuthCall, withTelemetrySpan } from "@/lib/telemetry/server";

export type VerifiedAuthContext = {
  claims: JwtPayload;
  userId: string;
  email?: string;
  userMetadata: JwtPayload["user_metadata"];
  aal: JwtPayload["aal"];
};

export class AuthContextError extends Error {
  constructor(public readonly status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthContextError";
  }
}

export function assertAal2Claims(
  claims: Pick<JwtPayload, "sub" | "aal"> | null,
): asserts claims is Pick<JwtPayload, "sub" | "aal"> {
  if (!claims?.sub) {
    throw new AuthContextError(401, "Authentication required.");
  }

  if (claims.aal !== "aal2") {
    throw new AuthContextError(403, "Multi-factor authentication required.");
  }
}

export const getSupabaseAuthContext = cache(async function getSupabaseAuthContext(): Promise<VerifiedAuthContext | null> {
  const supabase = await createSupabaseServerClient();
  recordAuthCall();
  const { data, error } = await withTelemetrySpan("auth.verified-user", () =>
    supabase.auth.getClaims(),
  );

  if (error || !data?.claims?.sub) {
    clearCurrentDatabaseUserId();
    return null;
  }

  setCurrentDatabaseUserId(data.claims.sub);

  return {
    claims: data.claims,
    userId: data.claims.sub,
    email: data.claims.email,
    userMetadata: data.claims.user_metadata,
    aal: data.claims.aal,
  };
});

export async function requireAal2Context(): Promise<VerifiedAuthContext> {
  const context = await getSupabaseAuthContext();

  if (!context) {
    assertAal2Claims(null);
    throw new Error("Unreachable authentication state.");
  }

  assertAal2Claims({ sub: context.userId, aal: context.aal });

  return context;
}

/** Use only at call sites that need the current Auth user record, not just identity. */
export async function getSupabaseFreshUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  recordAuthCall();
  const { data, error } = await withTelemetrySpan("auth.fresh-user", () =>
    supabase.auth.getUser(),
  );

  if (error) {
    clearCurrentDatabaseUserId();
    return null;
  }

  if (data.user) {
    setCurrentDatabaseUserId(data.user.id);
  }

  return data.user;
}
