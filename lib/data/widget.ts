import "server-only";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { getSettings } from "./settings";
import { listTrades } from "./trades";
import { listGoals } from "./goals";
import { missionDays, missionState } from "../analytics/mission";
import { uplift } from "../analytics/notify";
import { addDays, fmtMinute, minuteOfDay, parseHHMM, todayKey, weekdayIndex } from "../analytics/time";
import { QUOTES } from "../content/quotes";

/** A new widget key, replacing any old one. Shown once; only its hash is kept. */
export async function createWidgetToken(): Promise<string> {
  const sql = await db();
  const token = `ltjw_${randomToken(24)}`;
  await sql.begin(async (tx) => {
    await tx`delete from widget_tokens`;
    await tx`insert into widget_tokens (token_hash) values (${sha256(token)})`;
  });
  return token;
}

export async function revokeWidgetTokens(): Promise<void> {
  const sql = await db();
  await sql`delete from widget_tokens`;
}

export async function widgetStatus(): Promise<{ active: boolean; lastUsedAt: string | null }> {
  const sql = await db();
  const [r] = await sql<{ last_used_at: Date | null }[]>`select last_used_at from widget_tokens limit 1`;
  return { active: !!r, lastUsedAt: r?.last_used_at?.toISOString() ?? null };
}

/** True for the current key; notes when it was last used. */
export async function checkWidgetToken(token: string): Promise<boolean> {
  if (!/^ltjw_[A-Za-z0-9_-]{20,64}$/.test(token)) return false;
  const sql = await db();
  const rows = await sql`update widget_tokens set last_used_at = now() where token_hash = ${sha256(token)} returning token_hash`;
  return rows.length > 0;
}

export type WidgetFeed = { title: string; body: string; window: string | null; status: string; streak: number; mission: string; updated: string };

/** What the widget shows: today's positive line, your window, your streak. No money, no accounts. */
export async function widgetFeed(now = new Date()): Promise<WidgetFeed> {
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const day = todayKey(tz);
  const minute = minuteOfDay(now.toISOString(), tz);
  const start = parseHHMM(settings.rules.sessionStart);
  const end = parseHHMM(settings.rules.sessionEnd);
  const goals = await listGoals();
  const missionStart = settings.goals.missionStart ?? goals.reduce((m, g) => (g.createdAt.slice(0, 10) < m ? g.createdAt.slice(0, 10) : m), addDays(day, -30));
  const trades = await listTrades({ since: new Date(`${addDays(missionStart, -1)}T00:00:00Z`) });
  const streak = missionState(missionDays(trades, settings.rules, tz, missionStart, day), 0, 0).streak;

  const span = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`);
  let status = "Rest day";
  if (weekdayIndex(day) < 5 && start !== null) {
    if (minute < start) status = `Window opens in ${span(start - minute)}`;
    else if (end !== null && minute < end) status = `Window open · until ${fmtMinute(end)}`;
    else status = "Window closed · platform off";
  }
  const line = uplift({ day, quotes: QUOTES, slot: "morning" });
  return {
    title: line.title,
    body: line.body,
    window: start !== null && end !== null ? `${fmtMinute(start)}–${fmtMinute(end)}` : null,
    status,
    streak,
    mission: settings.goals.mission,
    updated: now.toISOString(),
  };
}
