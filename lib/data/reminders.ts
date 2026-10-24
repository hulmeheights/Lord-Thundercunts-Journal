import "server-only";
import { getSettings } from "./settings";
import { listTrades } from "./trades";
import { getJournalDay } from "./journal";
import { listGoals } from "./goals";
import { missionDays, missionState } from "../analytics/mission";
import { evening, preSession, type Reminder } from "../analytics/notify";
import { addDays, minuteOfDay, parseHHMM, todayKey } from "../analytics/time";
import { claimDaily, pushAll, subscriptionCount } from "../push";

/** Called by the cron: sends whichever reminder is due right now, once per day. */
export async function sendDueReminders(now = new Date()): Promise<{ kind: string; sent: number } | null> {
  if ((await subscriptionCount()) === 0) return null;
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const day = todayKey(tz);
  const minute = minuteOfDay(now.toISOString(), tz);
  const goals = await listGoals();
  const start = settings.goals.missionStart ?? goals.reduce((m, g) => (g.createdAt.slice(0, 10) < m ? g.createdAt.slice(0, 10) : m), addDays(day, -30));
  const trades = await listTrades({ since: new Date(`${addDays(start, -1)}T00:00:00Z`) });
  const days = missionDays(trades, settings.rules, tz, start, day);
  const streak = missionState(days, 0, 0).streak;
  const entry = await getJournalDay(day);

  let r: Reminder | null = null;
  if (settings.notify.preSession) {
    // Streak as of yesterday: nothing has happened yet today.
    const before = missionState(days.filter((d) => d.day < day), 0, 0).streak;
    r = preSession({ day, minute, sessionStart: parseHHMM(settings.rules.sessionStart), plan: entry.plan, streak: before, mission: settings.goals.mission });
  }
  if (!r && settings.notify.evening) {
    const journaled = [entry.review, entry.lessons, entry.wins].some((s) => (s?.trim().length ?? 0) > 0);
    r = evening({ day, minute, sessionEnd: parseHHMM(settings.rules.sessionEnd), today: days.find((d) => d.day === day), streak, journaled });
  }
  if (!r || !(await claimDaily(day, r.kind))) return null;
  const { sent } = await pushAll({ title: r.title, body: r.body, url: r.url, tag: r.kind });
  return { kind: r.kind, sent };
}
