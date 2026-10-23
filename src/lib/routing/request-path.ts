export const PUBLIC_AUTH_PATH_PREFIXES = ["/auth/callback", "/sign-in", "/sign-up"] as const;

export function matchesPathPrefix(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
