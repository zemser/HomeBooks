import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { noRealtimeOptions } from "@/lib/supabase/noop-websocket";

export const createSupabaseServerClient = cache(async function createSupabaseServerClient() {
  const { publishableKey, supabaseUrl } = getSupabasePublicConfig();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, publishableKey, {
    ...noRealtimeOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies. Middleware refreshes
          // sessions for normal requests, so this path is safe to ignore here.
        }
      },
    },
  });
});
