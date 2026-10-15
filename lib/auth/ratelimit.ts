import "server-only";
import { db } from "../db";

const IP_WINDOW_MIN = 15;
const IP_MAX_FAILS = 5;
const GLOBAL_WINDOW_MIN = 60;
const GLOBAL_MAX_FAILS = 30;

export type RateLimitResult = { ok: true } | { ok: false; reason: string };

/**
 * Two layers: per-network throttling, plus a global circuit breaker that
 * freezes passphrase unlock entirely during a distributed brute-force
 * attempt (passkeys keep working because they can't be guessed).
 */
export async function checkUnlockRateLimit(ipHash: string): Promise<RateLimitResult> {
  const sql = await db();
  const [row] = await sql<{ ip_fails: number; global_fails: number }[]>`
    select
      count(*) filter (
        where ip_hash = ${ipHash} and not success
        and created_at > now() - make_interval(mins => ${IP_WINDOW_MIN})
      )::int as ip_fails,
      count(*) filter (where not success)::int as global_fails
    from auth_attempts
    where created_at > now() - make_interval(mins => ${GLOBAL_WINDOW_MIN})
  `;
  if ((row?.ip_fails ?? 0) >= IP_MAX_FAILS) {
    return { ok: false, reason: `Too many attempts. Try again in ${IP_WINDOW_MIN} minutes.` };
  }
  if ((row?.global_fails ?? 0) >= GLOBAL_MAX_FAILS) {
    return {
      ok: false,
      reason: "Passphrase unlock is frozen for an hour after repeated failures. Use your passkey.",
    };
  }
  return { ok: true };
}

export async function recordAttempt(ipHash: string, success: boolean) {
  const sql = await db();
  await sql`insert into auth_attempts (ip_hash, success) values (${ipHash}, ${success})`;
  if (success) {
    await sql`delete from auth_attempts where created_at < now() - interval '7 days'`;
  }
}
