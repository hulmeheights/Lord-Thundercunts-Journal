import "server-only";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { NY, sessionOf } from "./signal";
import { minuteOfDay } from "../analytics/time";

/**
 * The bot on your Mac talks to the journal here. The journal only hands over
 * the stored alerts and your settings, and records what the Mac did: it never
 * contacts Topstep. Alerts older than 20 seconds are never handed over.
 */
export const ALERT_TTL_MS = 20_000;
/** The Mac counts as connected if it checked in within this long. */
export const ONLINE_MS = 45_000;

export async function createRunnerToken(): Promise<string> {
  const sql = await db();
  const t = `ltjr_${randomToken(24)}`;
  await sql`update bot_runner set token_hash = ${sha256(t)}, last_seen = null, info = null where id = 1`;
  return t;
}

export async function runnerAuthed(header: string | null): Promise<boolean> {
  const t = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!t.startsWith("ltjr_")) return false;
  const sql = await db();
  const [r] = await sql<{ token_hash: string | null }[]>`select token_hash from bot_runner where id = 1`;
  return !!r?.token_hash && r.token_hash === sha256(t);
}

export type MacAccount = { id: number; name: string; balance: number | null; canTrade: boolean };

export async function runnerStatus(): Promise<{ paired: boolean; lastSeen: string | null; online: boolean; info: string | null; accounts: MacAccount[]; accountsAt: string | null }> {
  const sql = await db();
  const [r] = await sql<{ token_hash: string | null; last_seen: Date | null; info: string | null; accounts: MacAccount[] | null; accounts_at: Date | null }[]>`
    select token_hash, last_seen, info, accounts, accounts_at from bot_runner where id = 1
  `;
  return {
    paired: !!r?.token_hash,
    lastSeen: r?.last_seen?.toISOString() ?? null,
    online: !!r?.last_seen && Date.now() - r.last_seen.getTime() < ONLINE_MS,
    info: r?.info ?? null,
    accounts: r?.accounts ?? [],
    accountsAt: r?.accounts_at?.toISOString() ?? null,
  };
}

/**
 * How long the Mac should wait before asking again. Inside (or within 5 minutes
 * of) a session it keeps a line open; outside, it naps until shortly before the
 * next one, so the database can sleep overnight.
 */
export function napSeconds(now: Date): number {
  if (process.env.NODE_ENV !== "production" && process.env.BOT_RUNNER_NO_NAP === "1") return 0; // local testing only
  if (sessionOf(now) !== "OTHER") return 0;
  const m = minuteOfDay(now.toISOString(), NY);
  const starts = [3 * 60, 9 * 60 + 30, 13 * 60 + 30, 20 * 60];
  const next = Math.min(...starts.map((s) => (s - m + 1440) % 1440));
  return next <= 5 ? 0 : Math.min(900, (next - 5) * 60);
}

export type HandedAlert = { signalId: string; dir: "LONG" | "SHORT"; price: number; stop: number; target: number; receivedAt: string; ageMs: number; mode: string | null; quiet: boolean | null; signal: unknown };

/** Live entry alerts waiting for the Mac (each handed over exactly once). Stale ones are marked missed. */
export async function claimAlerts(): Promise<HandedAlert[]> {
  const sql = await db();
  const missed = await sql<{ id: string }[]>`
    update bot_signals set handoff = 'missed' where handoff = 'waiting' and received_at < now() - interval '20 seconds' returning id
  `;
  if (missed.length) {
    const msg = `${missed.length} live ${missed.length === 1 ? "signal was" : "signals were"} not picked up by your Mac within 20 seconds: nothing placed`;
    await sql`insert into bot_events (level, message) values ('error', ${msg})`;
    const { botNotify } = await import("./notify");
    await botNotify(`⚠ Your Mac missed a signal\n${msg}. Check it's on and online.`, { push: true, critical: true });
  }
  const rows = await sql<{ id: string; dir: "LONG" | "SHORT"; price: number; stop: number; target: number; received_at: Date; age_ms: number; alert_mode: string | null; quiet: boolean | null; payload: unknown }[]>`
    update bot_signals set handoff = 'claimed', claimed_at = now()
    where handoff = 'waiting' and received_at >= now() - interval '20 seconds'
    returning id, dir, price, stop, target, received_at, alert_mode, quiet, payload, (extract(epoch from (now() - received_at)) * 1000)::int as age_ms
  `;
  return rows.map((r) => ({ signalId: r.id, dir: r.dir, price: r.price, stop: r.stop, target: r.target, receivedAt: r.received_at.toISOString(), ageMs: r.age_ms, mode: r.alert_mode, quiet: r.quiet, signal: r.payload ?? null }));
}
