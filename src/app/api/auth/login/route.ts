import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, AUTH_MAX_AGE_SECONDS, createSessionToken, safeNextPath, validateCredentials } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const nextPath = safeNextPath(formData.get("next"));

  if (!(await validateCredentials(username, password))) {
    const loginParams = new URLSearchParams({ error: "invalid", next: nextPath });
    return redirectTo(`/login?${loginParams.toString()}`);
  }

  const response = redirectTo(nextPath);
  response.cookies.set(AUTH_COOKIE_NAME, await createSessionToken(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: AUTH_MAX_AGE_SECONDS,
  });
  return response;
}

function redirectTo(path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: path,
    },
  });
}

function isSecureRequest(request: NextRequest): boolean {
  return request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}
