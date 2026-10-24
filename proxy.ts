import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-ltj_session" : "ltj_session";

/** Paths reachable without a session. Everything else is locked. */
const PUBLIC_PREFIXES = ["/unlock", "/setup", "/api/auth/", "/api/cron/"];
const PUBLIC_FILES = ["/manifest.webmanifest", "/robots.txt", "/icon.svg", "/apple-icon", "/icon-192.png", "/icon-512.png", "/sw.js"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p)) ||
    PUBLIC_FILES.some((p) => pathname.startsWith(p));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Fast lock: no session cookie → straight to the lock screen. (The cookie is
  // still fully validated against the database on every page and action.)
  if (!isPublic(pathname) && !request.cookies.get(SESSION_COOKIE)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/unlock";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const isLocal = ["localhost", "127.0.0.1"].includes(request.nextUrl.hostname);
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // https: so pasted chart screenshots (e.g. TradingView snapshots) can render. Images can't run code.
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    ...(isDev || isLocal ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
