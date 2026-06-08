import { NextRequest, NextResponse } from "next/server";
import { computeAuthToken, timingSafeEqualString } from "./app/auth";

const COOKIE_NAME = "ss-auth";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.APP_PASSCODE;
  if (!expected) {
    throw new Error("APP_PASSCODE env var is not set");
  }

  const cookie = request.cookies.get(COOKIE_NAME);
  if (cookie) {
    const expectedToken = await computeAuthToken(expected);
    if (timingSafeEqualString(cookie.value, expectedToken)) {
      return NextResponse.next();
    }
  }

  const loginUrl = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl, 307);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|login|images/|api/tracks).*)"],
};
