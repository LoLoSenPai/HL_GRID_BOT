import { NextResponse, type NextRequest } from "next/server";

export function redirectResponse(request: NextRequest, path: string, status = 303): NextResponse {
  return NextResponse.redirect(absoluteRequestUrl(request, path), status);
}

export function absoluteRequestUrl(request: NextRequest, path: string): URL {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProto ? `${forwardedProto}:` : request.nextUrl.protocol;
  return new URL(path, `${protocol}//${host}`);
}
