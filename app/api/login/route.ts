import { NextResponse } from "next/server";
import {
  checkPassword,
  createSessionValue,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth";

export const runtime = "nodejs";

export function safeNextPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  // URL parsing also catches backslash and control-character variants such as
  // `/\\evil.example`, which browsers normalize into cross-origin URLs.
  try {
    const base = "https://local.invalid";
    const destination = new URL(value, base);
    return destination.origin === base
      ? `${destination.pathname}${destination.search}${destination.hash}`
      : "/";
  } catch {
    return "/";
  }
}

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? "/") || "/");

  if (!process.env.APP_PASSWORD || !process.env.AUTH_SECRET) {
    return NextResponse.redirect(new URL("/login?error=unconfigured", req.url), 303);
  }

  if (!checkPassword(password)) {
    return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
