import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";

const SESSION_DAYS = 30;
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-ltj_session" : "ltj_session";

export type Session = { id: string; createdAt: Date; method: string };

/**
 * Opaque random session tokens. Only the SHA-256 hash is stored, so even a
 * full database dump can't be replayed as a login.
 */
export async function createSession(method: "passphrase" | "passkey"): Promise<void> {
  const sql = await db();
  const token = randomToken(32);
  const id = sha256(token);
  const ua = ((await headers()).get("user-agent") || "").slice(0, 200);
  await sql`
    insert into sessions (id, expires_at, user_agent, method)
    values (${id}, now() + make_interval(days => ${SESSION_DAYS}), ${ua}, ${method})
  `;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length < 20 || token.length > 100) return null;
  const id = sha256(token);
  const sql = await db();
  const rows = await sql<{ id: string; created_at: Date; method: string; last_seen_at: Date }[]>`
    select id, created_at, method, last_seen_at from sessions where id = ${id} and expires_at > now()
  `;
  const row = rows[0];
  if (!row) return null;
  // Sliding expiry, refreshed at most hourly.
  if (Date.now() - row.last_seen_at.getTime() > 60 * 60 * 1000) {
    await sql`
      update sessions set last_seen_at = now(), expires_at = now() + make_interval(days => ${SESSION_DAYS})
      where id = ${id}
    `;
  }
  return { id: row.id, createdAt: row.created_at, method: row.method };
});

/** For pages/layouts: redirect to the lock screen when not signed in. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/unlock");
  return session;
}

/** For server actions and route handlers: throw instead of redirecting. */
export async function assertSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const sql = await db();
    await sql`delete from sessions where id = ${sha256(token)}`;
  }
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(): Promise<void> {
  const sql = await db();
  await sql`delete from sessions`;
  (await cookies()).delete(SESSION_COOKIE);
}

export async function listSessions(currentId: string) {
  const sql = await db();
  const rows = await sql<{ id: string; created_at: Date; last_seen_at: Date; user_agent: string | null; method: string }[]>`
    select id, created_at, last_seen_at, user_agent, method from sessions
    where expires_at > now() order by last_seen_at desc limit 20
  `;
  return rows.map((r) => ({
    id: r.id.slice(0, 12),
    current: r.id === currentId,
    createdAt: r.created_at.toISOString(),
    lastSeenAt: r.last_seen_at.toISOString(),
    device: describeUserAgent(r.user_agent || ""),
    method: r.method,
  }));
}

function describeUserAgent(ua: string): string {
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Mac OS X/.test(ua)
        ? "Mac"
        : /Android/.test(ua)
          ? "Android"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return `${browser} on ${os}`;
}

/** Best-effort client IP hash for rate limiting (never stored in plain text). */
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return sha256(`ltj-ip:${ip}`);
}

/** Origin of the current request, used for WebAuthn and CSRF checks. */
export async function requestOrigin(): Promise<{ origin: string; rpID: string }> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "localhost:3000").split(",")[0]!.trim();
  const proto = (h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")).split(",")[0]!.trim();
  const rpID = host.replace(/:\d+$/, "");
  return { origin: `${proto}://${host}`, rpID };
}

/** Reject cross-site requests to route handlers (server actions do this natively). */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get("origin");
  const { origin: expected } = await requestOrigin();
  if (!origin || origin !== expected) throw new Error("Cross-origin request blocked");
}
