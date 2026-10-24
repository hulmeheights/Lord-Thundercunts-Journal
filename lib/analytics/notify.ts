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

export type NotifyKind = "morning" | "uplift" | "checkin" | "pre" | "close" | "evening" | "weekly" | "capsule" | "goal" | "rule";
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
export type Prep = { plan: boolean; readiness: boolean; ritualDone: number; ritualTotal: number };

/** What's still missing from the pre-session journal, in words, or null when it's all done. */
export function prepMissing(p: Prep): string | null {
  const todo = [
    !p.plan && "write your plan",
    !p.readiness && "rate how ready you are",
    p.ritualTotal > 0 && p.ritualDone < p.ritualTotal && `finish the ritual (${p.ritualDone}/${p.ritualTotal})`,
  ].filter(Boolean) as string[];
  return todo.length ? todo.join(", ") : null;
}

export function preSession(i: { day: string; minute: number; sessionStart: number | null; streak: number; mission: string; prep: Prep }): Reminder | null {
  if (!weekday(i.day) || i.sessionStart === null) return null;
  if (i.minute < i.sessionStart - 90 || i.minute >= i.sessionStart) return null;
  const left = i.sessionStart - i.minute;
  return {
    kind: "pre",
    key: i.day,
    title: clip(`Window opens ${fmtMinute(i.sessionStart)} · ${i.mission}`, 60),
    body: [
      `${left} min to go. Nothing before it.`,
      prepMissing(i.prep) ? `Before you trade: ${prepMissing(i.prep)}.` : "Plan, readiness and ritual done. You're ready.",
      i.streak > 0 ? `${plural(i.streak, "clean day")} in a row. Keep the engine lit.` : "Today can be day one of the streak.",
    ].join("\n"),
    url: prepMissing(i.prep) ? `/journal/${i.day}` : "/",
  };
}

/** The hour after the window closes: platform off, and the review while it's fresh. */
export function windowClosed(i: { day: string; minute: number; sessionEnd: number | null; trades: number; net: number; journaled: boolean }): Reminder | null {
  if (!weekday(i.day) || i.sessionEnd === null) return null;
  if (i.minute < i.sessionEnd || i.minute >= i.sessionEnd + 60 || quiet(i.minute)) return null;
  const done = `Window closed at ${fmtMinute(i.sessionEnd)}. Platform off: anything now is outside your window.`;
  const body = !i.trades
    ? `${done}\nNo trades today. If nothing set up, that's the job done.`
    : i.journaled
      ? `${done}\n${plural(i.trades, "trade")}, ${money(i.net)}. Review written. Good.`
      : `${done}\n${plural(i.trades, "trade")}, ${money(i.net)}. Write the review while it's fresh: what you saw, what you did, what you'd repeat.`;
  return { kind: "close", key: i.day, title: i.trades ? `Session done · ${money(i.net)}` : "Session done", body, url: `/journal/${i.day}` };
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

/**
 * 9:00 every day: a moment to pray, to God or the universe, or a line to
 * carry into the day. Which one, and which line, is drawn from the date, so
 * it changes daily but is the same however often the cron looks.
 */
export const PRAYERS: { title: string; body: string }[] = [
  { title: "Pray", body: "Before the charts: a minute with God. Ask for patience, not profit." },
  { title: "Pray", body: "Thank God for one thing that has nothing to do with money. Then ask for a calm head at 14:30." },
  { title: "Pray to the universe", body: "Tell the universe what you're grateful for today. Ask for discipline, and let the outcome go." },
  { title: "Pray", body: "Ask God for the strength to wait. Your window is coming; you don't have to chase anything before it." },
  { title: "A moment for the universe", body: "Breathe in for four, out for six. Ask the universe for clarity, and trust that what's meant for you won't pass you by." },
  { title: "Pray", body: "Give the debt, the bills and the worry to God for a minute. You only have to do today, and do it well." },
  { title: "Pray to the universe", body: "Ask the universe to put the right trades in front of you, and for the wisdom to skip the wrong ones." },
  { title: "Pray", body: "Lord, grant me the serenity to accept the losses I cannot change, the courage to follow my plan, and the wisdom to know the difference." },
  { title: "A moment of gratitude", body: "Three things you're grateful for, out loud, before you open anything. God hears it; so do you." },
  { title: "Pray", body: "Ask God to protect what you've built. One clean session is a prayer answered." },
  { title: "Pray to the universe", body: "Set your intention with the universe: inside the window, inside the rules, then walk away." },
  { title: "Pray", body: "Pray for the people you're doing this for. Then trade like they're watching." },
  { title: "A moment for the universe", body: "You are more than your P&L. Ask the universe for peace with whatever today brings." },
  { title: "Pray", body: "Ask God for a quiet mind. Fear and greed are loud; you don't have to listen to either today." },
];

export const GRATITUDE: { title: string; body: string }[] = [
  { title: "Thankful", body: "Name three things you're thankful for right now. Small counts: a brew, a laugh, a roof." },
  { title: "Thankful", body: "Who's in your corner? Send one of them a message today, no reason needed." },
  { title: "Thankful", body: "Your body carried you through this week. Thank it with water, a walk and an early night." },
  { title: "Thankful", body: "Write one line in the journal about something good that happened this week, however small." },
  { title: "Thankful", body: "You're still here, still learning, still showing up. That's worth being grateful for." },
  { title: "Thankful", body: "Think of a moment this week you handled better than the old you would have. Thank yourself for it." },
];

export const MANIFEST: { title: string; body: string }[] = [
  { title: "Manifest", body: "See it: the payout lands, the card is cleared, and you got there trading only your window. Hold that picture for a minute." },
  { title: "Manifest", body: "Say it out loud: “I am a patient trader. I wait for my setup, I take my stop, I walk away.”" },
  { title: "Manifest", body: "Picture next Friday's evening recap: five clean days. Feel what that's like, then go make it real one day at a time." },
  { title: "Manifest", body: "“Money comes to me through discipline, not desperation.” Read it twice." },
  { title: "Manifest", body: "Write down the life the payouts are for. Be specific. Read it before Monday's session." },
  { title: "Manifest", body: "You don't need every move. You need yours. Let the rest go by, knowing yours is coming." },
  { title: "Manifest", body: "Imagine the version of you a year from now, debt gone, calm at the screen. What would they thank you for doing this weekend?" },
];

type Draw = { day: string; quotes: readonly { text: string; cite: string }[]; pick?: number; salt?: string };

/** One positive message, drawn from the date: a prayer, a quote, gratitude or manifesting. */
export function uplift(i: Draw): { title: string; body: string } {
  let h = 2166136261;
  for (const c of `${i.salt ?? "morning"}:${i.day}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const seed = i.pick ?? h >>> 0;
  const n = Math.floor(seed / 4);
  switch (seed % 4) {
    case 0: return PRAYERS[n % PRAYERS.length]!;
    case 1: return GRATITUDE[n % GRATITUDE.length]!;
    case 2: return MANIFEST[n % MANIFEST.length]!;
    default: {
      if (!i.quotes.length) return PRAYERS[n % PRAYERS.length]!;
      const q = i.quotes[n % i.quotes.length]!;
      return { title: "Thought for the day", body: `“${q.text}”\n— ${q.cite}` };
    }
  }
}

/** 9:00 every day. */
export function morning(i: Draw & { minute: number }): Reminder | null {
  if (i.pick === undefined && (i.minute < 9 * 60 || i.minute >= 10 * 60)) return null;
  return { kind: "morning", key: i.day, url: "/", ...uplift(i) };
}

/** Weekends, 15:00: one more positive one, nothing about the market (a different draw from the morning's). */
export function weekendLift(i: Draw & { minute: number }): Reminder | null {
  if (weekdayIndex(i.day) < 5 || i.minute < 15 * 60 || i.minute >= 16 * 60) return null;
  return { kind: "uplift", key: i.day, url: "/", ...uplift({ ...i, salt: "weekend" }) };
}
