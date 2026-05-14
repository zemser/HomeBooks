const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY_ENV = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const SUPABASE_SECRET_KEY_ENV = "SUPABASE_SECRET_KEY";

export type FinappAuthMode = "dev" | "supabase";

export function getFinappAuthMode(): FinappAuthMode {
  return process.env.FINAPP_AUTH_MODE === "supabase" ? "supabase" : "dev";
}

export function getSupabasePublicConfig() {
  const supabaseUrl = process.env[SUPABASE_URL_ENV];
  const publishableKey = process.env[SUPABASE_PUBLISHABLE_KEY_ENV];

  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      `${SUPABASE_URL_ENV} and ${SUPABASE_PUBLISHABLE_KEY_ENV} must be set before Supabase auth can be used.`,
    );
  }

  return {
    publishableKey,
    supabaseUrl,
  };
}

export function getSupabaseServerConfig() {
  const { supabaseUrl } = getSupabasePublicConfig();
  const secretKey = process.env[SUPABASE_SECRET_KEY_ENV];

  if (!secretKey) {
    throw new Error(
      `${SUPABASE_SECRET_KEY_ENV} must be set before server-side Supabase storage can be used.`,
    );
  }

  return {
    secretKey,
    supabaseUrl,
  };
}
