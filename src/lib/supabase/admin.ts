import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerConfig } from "@/lib/supabase/config";

let adminClient: SupabaseClient | undefined;

export function createSupabaseAdminClient() {
  if (!adminClient) {
    const { secretKey, supabaseUrl } = getSupabaseServerConfig();

    adminClient = createClient(supabaseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return adminClient;
}
