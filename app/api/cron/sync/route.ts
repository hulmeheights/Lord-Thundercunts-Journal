import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { syncAll } from "@/lib/brokers/sync";
import { sendDueReminders } from "@/lib/data/reminders";
import { refreshNews } from "@/lib/bot/newsFeed";

export const maxDuration = 60;

/**
 * Hourly sync triggered by Vercel Cron (see vercel.json: one daily job per
 * hour, which Hobby allows). Vercel sends `Authorization: Bearer $CRON_SECRET`;
 * without CRON_SECRET set this endpoint refuses every request. After syncing it
 * sends whatever phone reminders are due, so rule alerts see the newest trades.
 */
export async function GET(request: Request) {
  const secret = env.cronSecret;
  const header = request.headers.get("authorization") || "";
  if (secret.length < 16 || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Skip connections synced in the last 45 minutes (opening the app syncs too).
  const results = await syncAll({ staleMinutes: 45 });
  const reminders = await sendDueReminders().catch(() => null);
  await refreshNews().catch(() => null);
  await macWatchdog().catch(() => null);
  // Strategy health: catch any close the instant check missed, and the Sunday 18:00 UK summary.
  await import("@/lib/bot/healthCheck").then(async (m) => { await m.checkHealth(); await m.weeklyHealth(); }).catch(() => null);
  return NextResponse.json({ ok: true, reminders, results: results.map((r) => ({ connection: r.connection, ok: r.ok, newFills: r.newFills ?? 0 })) });
}

/**
 * Autopilot's dead-man's switch: the Mac checks in at least every 15 minutes,
 * even while napping between sessions. If Autopilot is Live and the Mac has
 * been silent for over 30 minutes, it's off, asleep or offline, so say so
 * (at most every 6 hours), before a signal is missed rather than after.
 */
async function macWatchdog() {
  const [{ db }, { runnerStatus }, { botNotify }, { logEvent }] = await Promise.all([import("@/lib/db"), import("@/lib/bot/runner"), import("@/lib/bot/notify"), import("@/lib/bot/engine")]);
  const sql = await db();
  const [s] = await sql<{ mode: string }[]>`select mode from bot_settings where id = 1`;
  if (s?.mode !== "live") return;
  const r = await runnerStatus();
  if (!r.paired) return;
  const silentFor = r.lastSeen ? Date.now() - Date.parse(r.lastSeen) : Infinity;
  if (silentFor < 30 * 60_000) return;
  const message = "Your Mac hasn't checked in for over 30 minutes: signals will be missed until it's back (on, awake, online, and the bot running)";
  const [recent] = await sql<{ n: number }[]>`select count(*)::int as n from bot_events where message = ${message} and created_at > now() - interval '6 hours'`;
  if (recent?.n) return;
  await logEvent("error", message);
  await botNotify(`⚠ Your Mac is offline\n${message}. Run: python3 ~/autopilot-runner.py status`, { push: true, critical: true });
}
