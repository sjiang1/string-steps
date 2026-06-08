import { NextRequest, NextResponse } from "next/server";
import { computeAuthToken, sanitizeNext, timingSafeEqualString } from "../../auth";

const COOKIE_NAME = "ss-auth";
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.APP_PASSCODE;
  if (!expected) {
    throw new Error("APP_PASSCODE env var is not set");
  }

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const rawNext = form.get("next");
  const next = sanitizeNext(typeof rawNext === "string" ? rawNext : null);

  if (!timingSafeEqualString(password, expected)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "1");
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl, 303);
  }

  const token = await computeAuthToken(expected);
  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
