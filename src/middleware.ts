import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getFinappAuthMode, getSupabasePublicConfig } from "@/lib/supabase/config";
import { noRealtimeOptions } from "@/lib/supabase/noop-websocket";
import {
  FINAPP_PATHNAME_HEADER,
  MFA_PATH_PREFIXES,
  PUBLIC_AUTH_PATH_PREFIXES,
  matchesPathPrefix,
} from "@/lib/routing/request-path";

function isPublicPath(pathname: string) {
  return matchesPathPrefix(pathname, PUBLIC_AUTH_PATH_PREFIXES);
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

function isMfaPath(pathname: string) {
  return matchesPathPrefix(pathname, MFA_PATH_PREFIXES);
}

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(FINAPP_PATHNAME_HEADER, request.nextUrl.pathname);

  if (getFinappAuthMode() !== "supabase") {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  const { publishableKey, supabaseUrl } = getSupabasePublicConfig();
  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabase = createServerClient(supabaseUrl, publishableKey, {
    ...noRealtimeOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname) && !isApiPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl);
  }

  if (!user && isApiPath(pathname)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (user && isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && !isMfaPath(pathname)) {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (data?.currentLevel !== "aal2") {
      if (isApiPath(pathname)) {
        return NextResponse.json({ error: "Multi-factor authentication required." }, { status: 403 });
      }

      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/mfa";
      redirectUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
