export const FINAPP_PATHNAME_HEADER = "x-finapp-pathname";
export const NEXT_URL_HEADER = "next-url";
export const REFERER_HEADER = "referer";

export const PUBLIC_AUTH_PATH_PREFIXES = ["/auth/callback", "/sign-in", "/sign-up"] as const;
export const MFA_PATH_PREFIXES = ["/mfa"] as const;
export const SHELLLESS_PATHS = new Set(["/sign-in", "/sign-up", "/mfa", "/onboarding"]);

export function normalizePathname(value: string | null) {
  if (!value) {
    return "";
  }

  if (value.startsWith("/")) {
    return value.split("?")[0] ?? "";
  }

  try {
    return new URL(value).pathname;
  } catch {
    return "";
  }
}

export function resolveRequestPathname(headerStore: Headers) {
  const explicitPathname = normalizePathname(headerStore.get(FINAPP_PATHNAME_HEADER));

  if (explicitPathname) {
    return explicitPathname;
  }

  const nextUrlPathname = normalizePathname(headerStore.get(NEXT_URL_HEADER));

  if (nextUrlPathname) {
    return nextUrlPathname;
  }

  return normalizePathname(headerStore.get(REFERER_HEADER));
}

export function matchesPathPrefix(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
