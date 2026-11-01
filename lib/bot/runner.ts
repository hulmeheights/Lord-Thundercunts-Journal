import "server-only";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { NY, sessionOf } from "./signal";
import { minuteOfDay } from "../analytics/time";

/** Tickets the Mac hasn't placed within this long are never placed (a late entry is a different trade). */
export const TICKET_TTL_MS = 20_000;
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

export async function runnerStatus(): Promise<{ paired: boolean; lastSeen: string | null; online: boolean; info: string | null }> {
  const sql = await db();
  const [r] = await sql<{ token_hash: string | null; last_seen: Date | null; info: string | null }[]>`select token_hash, last_seen, info from bot_runner where id = 1`;
  return { paired: !!r?.token_hash, lastSeen: r?.last_seen?.toISOString() ?? null, online: !!r?.last_seen && Date.now() - r.last_seen.getTime() < ONLINE_MS, info: r?.info ?? null };
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

/** Mark tickets nobody placed in time (and claimed ones never reported) as expired; their trades become errors. */
export async function expireTickets() {
  const sql = await db();
  const gone = await sql<{ trade_id: string; status: string }[]>`
    update bot_orders set status = 'expired', done_at = now(),
      error = case when status = 'pending' then 'your Mac didn''t pick it up within 20 seconds' else 'your Mac took it but never confirmed: check TopstepX' end
    where (status = 'pending' and created_at < now() - interval '20 seconds') or (status = 'claimed' and claimed_at < now() - interval '60 seconds')
    returning trade_id, status
  `;
  for (const g of gone) {
    await sql`update bot_trades set status = 'error', reason = (select error from bot_orders where trade_id = ${g.trade_id} limit 1) where id = ${g.trade_id} and status = 'pending'`;
  }
  return gone.length;
}

export type Ticket = { id: string; accountId: number; contractId: string; dir: "LONG" | "SHORT"; size: number; stopTicks: number; targetTicks: number; tag: string; ageMs: number };

/** Hand any waiting tickets to the Mac (each exactly once). */
export async function claimTickets(): Promise<Ticket[]> {
  const sql = await db();
  const rows = await sql<{ id: string; topstep_account_id: string; contract_id: string; dir: "LONG" | "SHORT"; size: number; stop_ticks: number; target_ticks: number; tag: string; age_ms: number }[]>`
    update bot_orders set status = 'claimed', claimed_at = now()
    where status = 'pending' and created_at >= now() - interval '20 seconds'
    returning id, topstep_account_id, contract_id, dir, size, stop_ticks, target_ticks, tag, (extract(epoch from (now() - created_at)) * 1000)::int as age_ms
  `;
  return rows.map((r) => ({ id: r.id, accountId: Number(r.topstep_account_id), contractId: r.contract_id, dir: r.dir, size: r.size, stopTicks: r.stop_ticks, targetTicks: r.target_ticks, tag: r.tag, ageMs: r.age_ms }));
}
