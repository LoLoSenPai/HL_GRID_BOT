import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, isAuthConfigured, isAuthDisabled, verifySessionToken } from "@/lib/auth/session";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/logout", "/api/health", "/favicon.ico"]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname) || isAuthDisabled()) {
    return NextResponse.next();
  }

  const authenticated = await verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  if (authenticated) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  if (!isAuthConfigured()) loginUrl.searchParams.set("error", "config");
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}
