import "server-only";
import { missionDaysWithGoals } from "../analytics/missionGoals";
import { getSettings } from "./settings";
import { listTrades } from "./trades";
import { dueCapsules, getJournalDay } from "./journal";
import { listGoals, setGoalDone } from "./goals";
import { listLedger } from "./ledger";
import { missionState } from "../analytics/mission";
import { checkGoal } from "../analytics/goalcheck";
import { evaluateRules } from "../analytics/rules";
import { capsuleReady, clockChange, morning, weekendLift, checkin, evening, goalNews, preSession, quiet, ruleAlerts, weekly, windowClosed, type GoalEvent, type Reminder, type RuleBreak } from "../analytics/notify";
import { addDays, dayKey, fmtMinute, minuteOfDay, weekdayIndex, windowFor } from "../analytics/time";
import { claimDaily, pushAll, subscriptionCount } from "../push";
import { QUOTES } from "../content/quotes";

/** Called by the cron about once an hour: sends whatever is due right now, each reminder once. */
export async function sendDueReminders(now = new Date()): Promise<{ sent: string[] }> {
  const sent: string[] = [];
  if ((await subscriptionCount()) === 0) return { sent };
  const settings = await getSettings();
  const n = settings.notify;
  const tz = settings.profile.timezone;
  const day = dayKey(now, tz);
  const minute = minuteOfDay(now.toISOString(), tz);
  if (quiet(minute)) return { sent };

  const [goals, ledger, entry] = await Promise.all([listGoals(), listLedger(), getJournalDay(day)]);
  const startOf = (g: (typeof goals)[number]) => g.startedOn ?? g.createdAt.slice(0, 10);
  const missionStart = settings.goals.missionStart ?? goals.reduce((m, g) => (g.createdAt.slice(0, 10) < m ? g.createdAt.slice(0, 10) : m), addDays(day, -30));
  const from = [missionStart, addDays(day, -7), ...goals.filter((g) => g.measure).map(startOf)].sort()[0]!;
  const trades = await listTrades({ since: new Date(`${addDays(from, -1)}T00:00:00Z`) });
  const days = missionDaysWithGoals(trades, settings.rules, tz, missionStart < addDays(day, -7) ? missionStart : addDays(day, -7), day, settings.goals.counts, goals);
  // Today's window on your clock, moved with New York on the weeks the clocks are out of step.
  const { start: sessionStart, end: sessionEnd, shift } = windowFor(settings.rules, day, tz);

  // Measured goals: where each stands, and whether it has just been reached or broken.
  const ctx = { trades, ledger, rules: settings.rules, tz, today: day };
  const live: { title: string; headline: string }[] = [];
  const events: GoalEvent[] = [];
  for (const g of goals) {
    if (!g.measure) continue;
    const p = checkGoal(g.measure, startOf(g), g.targetDay, ctx);
    if (g.completedAt) continue;
    if (p.status === "reached") {
      await setGoalDone(g.id, true);
      events.push({ id: g.id, title: g.title, reward: g.reward, startedOn: startOf(g), status: "reached", detail: p.detail, targetDay: g.targetDay });
    } else if (p.status === "broken") {
      events.push({ id: g.id, title: g.title, reward: g.reward, startedOn: startOf(g), status: "broken", detail: p.detail, targetDay: g.targetDay });
    } else live.push({ title: g.title, headline: p.headline });
  }

  const due: Reminder[] = [];
  const add = (r: Reminder | Reminder[] | null) => (Array.isArray(r) ? due.push(...r) : r && due.push(r));
  const streak = (upTo: string) => missionState(days.filter((d) => d.day <= upTo && d.day >= missionStart), 0, 0).streak;

  if (n.ruleAlerts) {
    const todays = trades.filter((t) => dayKey(t.entryTime, tz) === day);
    const breaks: RuleBreak[] = [];
    for (const v of evaluateRules(todays, settings.rules, tz).violations) {
      if (v.rule !== "session" && v.rule !== "maxTrades" && v.rule !== "maxDailyLoss" && v.rule !== "stopAfterLosses") continue;
      const first = todays.filter((t) => v.tradeIds.includes(t.id)).sort((a, b) => a.entryTime.localeCompare(b.entryTime))[0];
      breaks.push({ rule: v.rule, firstEntry: first ? fmtMinute(minuteOfDay(first.entryTime, tz)) : "", detail: v.detail });
    }
    add(ruleAlerts({ day, minute, breaks }));
  }
  if (n.goals) add(goalNews({ day, minute, events, due: goals.filter((g) => !g.completedAt && g.targetDay).map((g) => ({ id: g.id, title: g.title, targetDay: g.targetDay!, headline: live.find((l) => l.title === g.title)?.headline ?? null })) }));
  if (n.capsules) add(capsuleReady({ minute, capsules: (await dueCapsules(day)).filter((c) => !c.openedAt) }));
  if (n.morning) add(morning({ day, minute, quotes: QUOTES }));
  if (n.morning) add(weekendLift({ day, minute, quotes: QUOTES }));
  if (settings.rules.followMarket && settings.rules.sessionStart) {
    // Compare tomorrow with the last trading day, so a Sunday change is announced on the Sunday evening.
    let last = day;
    while (weekdayIndex(last) >= 5) last = addDays(last, -1);
    const before = windowFor(settings.rules, last, tz).shift;
    add(clockChange({ day, minute, before, next: windowFor(settings.rules, addDays(day, 1), tz) }));
  }
  if (n.checkin) add(checkin({ day, minute, sessionStart, sessionEnd, plan: entry.plan, goals: live, shift }));
  const pre = settings.ritual.filter((r) => r.group === "pre");
  const prep = { plan: !!entry.plan?.trim(), readiness: entry.readiness !== null, ritualDone: pre.filter((r) => entry.checklist[r.id]).length, ritualTotal: pre.length };
  if (n.preSession) add(preSession({ day, minute, sessionStart, streak: streak(addDays(day, -1)), mission: settings.goals.mission, prep }));
  const journaled = [entry.review, entry.lessons, entry.wins].some((s) => (s?.trim().length ?? 0) > 0);
  if (n.close) {
    const todays = days.find((d) => d.day === day);
    add(windowClosed({ day, minute, sessionEnd, trades: todays?.trades ?? 0, net: todays?.net ?? 0, journaled }));
  }
  if (n.evening) {
    add(evening({ day, minute, sessionEnd, today: days.find((d) => d.day === day), streak: streak(day), journaled }));
  }
  if (n.weekly) add(weekly({ day, minute, week: days.filter((d) => d.day > addDays(day, -7)) }));

  // At most three a run, the most urgent first (the order above), so nothing piles up.
  for (const r of due) {
    if (sent.length >= 3) break;
    if (!(await claimDaily(r.key, r.kind))) continue;
    const res = await pushAll({ title: r.title, body: r.body, url: r.url, tag: `${r.kind}:${r.key}` });
    if (res.sent > 0) sent.push(r.kind);
  }
  return { sent };
}
