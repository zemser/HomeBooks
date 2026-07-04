import type { User } from "@supabase/supabase-js";

import { clearCurrentDatabaseUserId, setCurrentDatabaseUserId } from "@/db/request-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getSupabaseAuthenticatedUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

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
