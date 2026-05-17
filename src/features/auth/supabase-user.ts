import type { User } from "@supabase/supabase-js";

import { setCurrentDatabaseUserId } from "@/db/request-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getSupabaseAuthenticatedUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  if (data.user) {
    setCurrentDatabaseUserId(data.user.id);
  }

  return data.user;
}
