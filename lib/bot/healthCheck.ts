import { db } from "../db";
import { botNotify } from "./notify";
import { logEvent } from "./engine";
import { health, healthBack, healthWarning, healthWeekly, onePerSignal, weeklyDue, type Health, type HealthRow } from "./health";

export type HealthState = Health & { state: "ok" | "warn"; changedAt: string | null; failedSets: number };

/** Every closed bot trade (live, dry run and paper), oldest first. */
async function closedRows(): Promise<HealthRow[]> {
  const sql = await db();
  const rows = await sql<{ id: string; tv_id: string | null; signal_id: string | null; mode: string; qty: number; pnl: number; exited_at: Date }[]>`
    select id, tv_id, signal_id, mode, qty, pnl, exited_at from bot_trades
    where status = 'closed' and pnl is not null and exited_at is not null and mode in ('live', 'dry', 'paper')
      and exited_at > '2026-11-03T22:00:00Z'
    order by exited_at
  `;
  return rows.map((r) => ({ id: r.id, tvId: r.tv_id, signalId: r.signal_id, mode: r.mode, qty: r.qty, pnl: r.pnl, exitedAt: r.exited_at.toISOString() }));
}

/**
 * Recompute PF60 and push to your phone once when it crosses 1.0 either way
 * (no Telegram). Called after every closed trade and every hour. It never touches
 * a trade or the switch.
 */
export async function checkHealth(): Promise<HealthState> {
  const sql = await db();
  const h = health(onePerSignal(await closedRows()).map((t) => t.pnl));
  const next = h.ok ? "ok" : "warn";
  const [prev] = await sql<{ state: string; changed_at: Date | null; failed_sets: number }[]>`select state, changed_at, failed_sets from bot_health where id = 1`;
  let changedAt = prev?.changed_at ?? null;
  if (prev?.state !== next) {
    const [won] = await sql<{ id: number }[]>`
      update bot_health set state = ${next}, pf60 = ${h.pf60}, n = ${h.n}, changed_at = now() where id = 1 and state is distinct from ${next} returning id
    `;
    if (won) {
      changedAt = new Date();
      const text = next === "warn" ? healthWarning(h.pf60) : healthBack(h.pf60);
      await logEvent(next === "warn" ? "error" : "info", text.split("\n")[0]!);
      await botNotify(text, { push: true, telegram: false, critical: true, always: true, url: "/autopilot" });
    }
  } else await sql`update bot_health set pf60 = ${h.pf60}, n = ${h.n} where id = 1`;
  return { ...h, state: next, changedAt: changedAt ? changedAt.toISOString() : null, failedSets: prev?.failed_sets ?? 0 };
}

/** Sundays from 18:00 UK (the hourly cron): one PF60 summary a week. */
export async function weeklyHealth(now = new Date()) {
  const sql = await db();
  const [row] = await sql<{ weekly_at: Date | null }[]>`select weekly_at from bot_health where id = 1`;
  if (!weeklyDue(now, row?.weekly_at ?? null)) return;
  const h = await checkHealth();
  const [won] = await sql<{ id: number }[]>`update bot_health set weekly_at = ${now} where id = 1 and (weekly_at is null or weekly_at < ${new Date(now.getTime() - 6 * 86_400_000)}) returning id`;
  if (won) await botNotify(healthWeekly(h), { push: true, telegram: false, critical: true, always: true, url: "/autopilot" });
}
