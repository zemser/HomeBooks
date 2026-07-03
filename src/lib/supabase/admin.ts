import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerConfig } from "@/lib/supabase/config";
import { noRealtimeOptions } from "@/lib/supabase/noop-websocket";

let adminClient: SupabaseClient | undefined;

export function createSupabaseAdminClient() {
  if (!adminClient) {
    const { secretKey, supabaseUrl } = getSupabaseServerConfig();

    adminClient = createClient(supabaseUrl, secretKey, {
      ...noRealtimeOptions,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return adminClient;
}
