/**
 * What the phone says, and when. Pure, so the wording and the timing are tested.
 *
 * The cron calls in about once an hour (a daily job per hour; on Vercel Hobby
 * each fires somewhere inside its hour), so every reminder has a local-time
 * window at least an hour wide: exactly one run lands in it, whatever the
 * clocks are doing. Each reminder is claimed once (per day, or per item).
 */
import { fmtMinute, weekdayIndex } from "./time";
import type { MissionDay } from "./mission";

export type NotifyKind = "checkin" | "pre" | "evening" | "weekly" | "capsule" | "goal" | "rule";
export type Reminder = { kind: NotifyKind; /** What it's claimed under: once per this key. */ key: string; title: string; body: string; url: string };

/** No pushes overnight, whatever is due. */
export const QUIET = { from: 22 * 60 + 30, to: 7 * 60 };
export const quiet = (minute: number) => minute >= QUIET.from || minute < QUIET.to;

const money = (n: number) => `${n < 0 ? "−" : "+"}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const weekday = (day: string) => weekdayIndex(day) < 5;

export type LiveGoal = { title: string; headline: string };

/** 12:00 on trading days: the window, the plan, the goals in play. */
export function checkin(i: { day: string; minute: number; sessionStart: number | null; sessionEnd: number | null; plan: string | null; goals: LiveGoal[] }): Reminder | null {
  if (!weekday(i.day) || i.minute < 12 * 60 || i.minute >= 13 * 60) return null;
  const open = i.sessionStart;
  if (open !== null && i.minute >= open) return null;
  const lines = [
    open !== null
      ? `Your window is ${fmtMinute(open)}${i.sessionEnd !== null ? `–${fmtMinute(i.sessionEnd)}` : ""}. No orders before ${fmtMinute(open)}: platform closed until then.`
      : "Set your trading window in Settings so I can hold you to it.",
  ];
  lines.push(i.plan?.trim() ? `Plan: ${clip(i.plan.trim().replace(/\s+/g, " "), 80)}` : "No plan written yet. Write it now, before the screen does it for you.");
  if (i.goals.length) lines.push(i.goals.slice(0, 2).map((g) => `${clip(g.title, 40)}: ${g.headline}`).join(" · "));
  return { kind: "checkin", key: i.day, title: "12:00 check-in", body: lines.join("\n"), url: `/journal/${i.day}` };
}

/** In the 90 minutes before the window opens: when it opens, your streak. */
export function preSession(i: { day: string; minute: number; sessionStart: number | null; streak: number; mission: string }): Reminder | null {
  if (!weekday(i.day) || i.sessionStart === null) return null;
  if (i.minute < i.sessionStart - 90 || i.minute >= i.sessionStart) return null;
  const left = i.sessionStart - i.minute;
  return {
    kind: "pre",
    key: i.day,
    title: clip(`Window opens ${fmtMinute(i.sessionStart)} · ${i.mission}`, 60),
    body: `${left} min to go. Nothing before it.\n${i.streak > 0 ? `${plural(i.streak, "clean day")} in a row. Keep the engine lit.` : "Today can be day one of the streak."}`,
    url: "/",
  };
}

/** The evening after a trading day: how it counted, and the journal. */
export function evening(i: { day: string; minute: number; sessionEnd: number | null; today: MissionDay | undefined; streak: number; journaled: boolean }): Reminder | null {
  const from = Math.max((i.sessionEnd ?? 16 * 60) + 60, 19 * 60);
  if (i.minute < from || quiet(i.minute)) return null;
  const d = i.today;
  if (!d && !weekday(i.day)) return null;
  const write = i.journaled ? "" : " Two minutes in the journal while it's fresh?";
  const url = `/journal/${i.day}`;
  if (!d || d.kind === "hold") return { kind: "evening", key: i.day, title: "Sat out · altitude held", body: `No trades today. That still counts.${write}`, url };
  if (d.kind === "burn") {
    return { kind: "evening", key: i.day, title: `Clean day · ${money(d.net)}`, body: `${plural(d.trades, "trade")}, all inside your rules. ${i.streak} clean in a row.${write}`, url };
  }
  return {
    kind: "evening",
    key: i.day,
    title: `Fuel leaked · ${money(d.net)}`,
    body: `${d.reasons.join(", ").replace(/^./, (c) => c.toUpperCase())}. One day doesn't end the mission; tomorrow is a fresh burn.${write}`,
    url,
  };
}

/** Sunday evening: the week, and the Observer. */
export function weekly(i: { day: string; minute: number; week: MissionDay[] }): Reminder | null {
  if (weekdayIndex(i.day) !== 6 || i.minute < 17 * 60 || i.minute >= 20 * 60) return null;
  const traded = i.week.filter((d) => d.trades > 0);
  const net = traded.reduce((s, d) => s + d.net, 0);
  const clean = i.week.filter((d) => d.kind === "burn").length;
  const leaks = i.week.filter((d) => d.kind === "leak").length;
  return {
    kind: "weekly",
    key: i.day,
    title: "Your week, from the outside",
    body: traded.length
      ? `${plural(clean, "clean day")}, ${plural(leaks, "leak")}, ${money(net)}. Ten minutes with the Observer before Monday.`
      : "No trades this week. Ten minutes with the Observer to set up next week.",
    url: "/observer",
  };
}

/** A time capsule whose day has come. */
export function capsuleReady(i: { minute: number; capsules: { id: string; createdAt: string }[] }): Reminder[] {
  if (i.minute < 8 * 60 || quiet(i.minute)) return [];
  return i.capsules.map((c) => ({
    kind: "capsule",
    key: c.id,
    title: "A time capsule is ready",
    body: `Sealed ${new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. Your past self has something to say, and goals to check.`,
    url: "/journal#capsules",
  }));
}

export type GoalEvent = { id: string; title: string; reward: string | null; startedOn: string; status: "reached" | "broken"; detail: string | null; targetDay: string | null };

/** A goal reached or broken since the last run, and goals near their date. */
export function goalNews(i: { day: string; minute: number; events: GoalEvent[]; due: { id: string; title: string; targetDay: string; headline: string | null }[] }): Reminder[] {
  if (i.minute < 8 * 60 || quiet(i.minute)) return [];
  const out: Reminder[] = i.events.map((g) =>
    g.status === "reached"
      ? {
          kind: "goal" as const,
          key: `${g.id}:reached`,
          title: `Goal reached · ${clip(g.title, 40)}`,
          body: g.reward ? `You've earned it: ${clip(g.reward, 80)}. Go and take it.` : "You did what you said you would.",
          url: "/journal#goals",
        }
      : {
          kind: "goal" as const,
          key: `${g.id}:${g.startedOn}:broken`,
          title: `Goal broken · ${clip(g.title, 40)}`,
          body: `${g.detail ? `${clip(g.detail, 90)}. ` : ""}Start it again from today: one day doesn't define the run.`,
          url: "/journal#goals",
        },
  );
  for (const g of i.due) {
    const left = Math.round((Date.parse(`${g.targetDay}T00:00:00Z`) - Date.parse(`${i.day}T00:00:00Z`)) / 86_400_000);
    if (left !== 3 && left !== 1) continue;
    out.push({
      kind: "goal",
      key: `${g.id}:due${left}`,
      title: `${left === 1 ? "Tomorrow" : "3 days left"} · ${clip(g.title, 40)}`,
      body: g.headline ? `Where it stands: ${g.headline}.` : "Mark it reached when it's done.",
      url: "/journal#goals",
    });
  }
  return out;
}

export type RuleBreak = { rule: "session" | "maxTrades" | "maxDailyLoss" | "stopAfterLosses"; firstEntry: string; detail: string };

/** As soon as a sync shows today's trades breaking the rules that matter most. */
export function ruleAlerts(i: { day: string; minute: number; breaks: RuleBreak[] }): Reminder[] {
  if (quiet(i.minute)) return [];
  const say: Record<RuleBreak["rule"], (b: RuleBreak) => [string, string]> = {
    session: (b) => ["Outside your window", `Entry at ${b.firstEntry}. That's how the worst days start. Close the platform and come back at your window.`],
    maxTrades: (b) => ["Trade limit passed", `${b.detail}. You're done for today. Nothing good comes after the limit.`],
    maxDailyLoss: () => ["Daily loss limit hit", "Stop now. The account is worth more than getting it back today."],
    stopAfterLosses: (b) => ["Losing streak: stop", `${b.detail}. Walk away for the day; the next trade won't be clean.`],
  };
  return i.breaks.map((b) => {
    const [title, body] = say[b.rule](b);
    return { kind: "rule", key: `${i.day}:${b.rule}`, title, body, url: "/" };
  });
}
