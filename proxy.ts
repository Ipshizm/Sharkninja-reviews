import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "./lib/auth";

const PUBLIC = new Set(["/login", "/api/login"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.has(pathname)) return NextResponse.next();

  // Temporary emergency access: dashboard pages are publicly viewable, while
  // every mutating API remains protected below. Remove this block when the
  // Vercel account is recovered and normal sign-in can be restored.
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // The blank import template is safe to download without a session.
  if (pathname === "/api/template") return NextResponse.next();

  // The scraper posts here with a shared secret instead of a session cookie.
  if (pathname === "/api/ingest") {
    const token = req.headers.get("x-ingest-token");
    if (token && process.env.INGEST_TOKEN && token === process.env.INGEST_TOKEN) {
      return NextResponse.next();
    }
  }

  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
