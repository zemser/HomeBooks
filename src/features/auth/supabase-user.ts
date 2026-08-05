import type { User } from "@supabase/supabase-js";

import { clearCurrentDatabaseUserId, setCurrentDatabaseUserId } from "@/db/request-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAuthCall, withTelemetrySpan } from "@/lib/telemetry/server";

export async function getSupabaseAuthenticatedUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  recordAuthCall();
  const { data, error } = await withTelemetrySpan("auth.verified-user", () =>
    supabase.auth.getUser(),
  );

  if (error) {
    clearCurrentDatabaseUserId();
    return null;
  }

  if (data.user) {
    setCurrentDatabaseUserId(data.user.id);
  } else {
    clearCurrentDatabaseUserId();
  }

  return data.user;
}
