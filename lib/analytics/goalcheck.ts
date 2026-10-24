/**
 * Trading goals that check themselves. A goal is measured one of three ways:
 *  - rules kept on every trading day (only 14:30–16:00, max 3 trades, …) for a
 *    stretch: N weeks with no breaks, N trading days in a row, or N in total;
 *  - a number reached since the goal started (net P&L, payouts, evals passed);
 *  - a rate over your next N trades or trading days (win rate, green days).
 * Pure functions, so every verdict is unit-tested.
 */
import type { Trade, TradingRules } from "../types";
import { fmtMoney } from "../format";
import { qtyOf, type LedgerEntry } from "./ledger";
import { missionDays } from "./mission";
import { evaluateRules } from "./rules";
import { detectTilt } from "./tilt";
import { addDays, dayKey, daysBetween, fmtMinute, parseHHMM } from "./time";

export type GoalRule =
  | { type: "window"; start: string; end: string }
  | { type: "maxTrades"; n: number }
  | { type: "maxDayLoss"; amount: number }
  | { type: "stopAfterLosses"; n: number }
  | { type: "maxLossPerTrade"; amount: number }
  | { type: "maxContracts"; n: number }
  | { type: "cooldown"; minutes: number }
  | { type: "noRevenge" }
  | { type: "greenDay" }
  | { type: "myRules" };

export type GoalSpan = "weeks" | "inARow" | "total";
export type TotalMetric = "net" | "paidOut" | "payouts" | "evalsPassed";
export type RateMetric = "winRate" | "greenDays";

export type GoalMeasure =
  | { kind: "days"; rules: GoalRule[]; span: GoalSpan; n: number }
  | { kind: "total"; metric: TotalMetric; target: number }
  | { kind: "rate"; metric: RateMetric; target: number; over: number };

export type GoalDayMark = { day: string; ok: boolean; why: string[] };

export type GoalProgress = {
  status: "going" | "reached" | "broken";
  /** Where it stands, in a few words: "6 / 10 days in a row". */
  headline: string;
  /** 0–1 for the bar. */
  progress: number;
  /** The line under it: what broke it, or what's left. */
  detail: string | null;
  /** The trading days it has judged so far, oldest first. */
  marks: GoalDayMark[];
  /** The day it was reached, for the auto-complete. */
  reachedOn: string | null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** One rule, in words: what the goal card and auto-title say. */
export function describeRule(r: GoalRule): string {
  switch (r.type) {
    case "window": return `only enter ${r.start}–${r.end}`;
    case "maxTrades": return `no more than ${plural(r.n, "trade")} a day`;
    case "maxDayLoss": return `never lose more than ${fmtMoney(r.amount)} in a day`;
    case "stopAfterLosses": return `stop after ${plural(r.n, "loss", "losses")} in a row`;
    case "maxLossPerTrade": return `no single loss bigger than ${fmtMoney(r.amount)}`;
    case "maxContracts": return `no more than ${plural(r.n, "contract")}`;
    case "cooldown": return `wait ${r.minutes} min after a loss`;
    case "noRevenge": return "no revenge trades";
    case "greenDay": return "every trading day green";
    case "myRules": return "keep all my rules";
  }
}

export function describeMeasure(m: GoalMeasure): string {
  if (m.kind === "days") {
    const rules = m.rules.map(describeRule).join(", ");
    const span = m.span === "weeks" ? `for ${plural(m.n, "week")}` : m.span === "inARow" ? `for ${plural(m.n, "trading day")} in a row` : `on ${plural(m.n, "trading day")}`;
    const s = `${rules.charAt(0).toUpperCase()}${rules.slice(1)} ${span}`;
    return s.length > 160 ? `${s.slice(0, 159)}…` : s;
  }
  if (m.kind === "total") {
    switch (m.metric) {
      case "net": return `Make ${fmtMoney(m.target, { sign: true })} net`;
      case "paidOut": return `${fmtMoney(m.target)} paid out`;
      case "payouts": return `Get ${plural(m.target, "payout")}`;
      case "evalsPassed": return `Pass ${plural(m.target, "eval")}`;
    }
  }
  return m.metric === "winRate" ? `Win ${m.target}% of my next ${m.over} trades` : `${m.target}% green over my next ${plural(m.over, "trading day")}`;
}

/** The rules engine settings for the rules it can check. */
function engineRules(rules: GoalRule[]): TradingRules {
  const r: TradingRules = { maxTradesPerDay: null, maxDailyLoss: null, stopAfterConsecutiveLosses: null, maxContracts: null, maxLossPerTrade: null, cooldownMinutesAfterLoss: null, sessionStart: null, sessionEnd: null, defaultRisk: null, custom: [] };
  for (const x of rules) {
    if (x.type === "window") [r.sessionStart, r.sessionEnd] = [x.start, x.end];
    if (x.type === "maxTrades") r.maxTradesPerDay = x.n;
    if (x.type === "stopAfterLosses") r.stopAfterConsecutiveLosses = x.n;
    if (x.type === "maxLossPerTrade") r.maxLossPerTrade = x.amount;
    if (x.type === "maxContracts") r.maxContracts = x.n;
    if (x.type === "cooldown") r.cooldownMinutesAfterLoss = x.minutes;
  }
  return r;
}

/** Every trading day from `from` to `to`, judged against the goal's rules. */
export function judgeDays(trades: Trade[], rules: GoalRule[], yours: TradingRules, tz: string, from: string, to: string): GoalDayMark[] {
  const inRange = trades.filter((t) => {
    const d = dayKey(t.entryTime, tz);
    return d >= from && d <= to;
  });
  const why = new Map<string, Set<string>>();
  const add = (day: string, reason: string) => why.set(day, (why.get(day) ?? new Set()).add(reason));
  const net = new Map<string, number>();
  for (const t of inRange) {
    const d = dayKey(t.entryTime, tz);
    net.set(d, (net.get(d) ?? 0) + t.netPnl);
  }

  for (const v of evaluateRules(inRange, engineRules(rules), tz).violations) {
    if (v.rule === "session") {
      const w = rules.find((r) => r.type === "window") as Extract<GoalRule, { type: "window" }>;
      add(v.day, `${plural(v.tradeIds.length, "entry", "entries")} outside ${w.start}–${w.end}`);
    } else add(v.day, v.detail.charAt(0).toLowerCase() + v.detail.slice(1));
  }
  const dayLoss = rules.find((r) => r.type === "maxDayLoss") as Extract<GoalRule, { type: "maxDayLoss" }> | undefined;
  if (dayLoss) for (const [d, n] of net) if (n < -dayLoss.amount) add(d, `lost ${fmtMoney(-n)} on the day`);
  if (rules.some((r) => r.type === "greenDay")) for (const [d, n] of net) if (n <= 0) add(d, n < 0 ? "red day" : "flat day");
  if (rules.some((r) => r.type === "noRevenge")) {
    const flagged = detectTilt(inRange, tz).flaggedIds;
    for (const t of inRange) if (flagged.has(t.id)) add(dayKey(t.entryTime, tz), "revenge trade");
  }
  if (rules.some((r) => r.type === "myRules")) for (const d of missionDays(inRange, yours, tz, from, to)) for (const r of d.reasons) add(d.day, r);

  return [...net.keys()].sort().map((day) => ({ day, ok: !why.has(day), why: [...(why.get(day) ?? [])] }));
}

export type GoalContext = { trades: Trade[]; ledger: LedgerEntry[]; rules: TradingRules; tz: string; today: string };

/** Where a measured goal stands today. `start` is the day it started (or was restarted). */
export function checkGoal(m: GoalMeasure, start: string, byDay: string | null, ctx: GoalContext): GoalProgress {
  const { today } = ctx;
  const late = byDay !== null && today > byDay;
  const base = { marks: [] as GoalDayMark[], reachedOn: null as string | null };

  if (m.kind === "days") {
    const end = m.span === "weeks" ? addDays(start, m.n * 7 - 1) : today;
    const marks = judgeDays(ctx.trades, m.rules, ctx.rules, ctx.tz, start, end < today ? end : today);
    const broke = marks.find((d) => !d.ok);
    const why = (d: GoalDayMark) => `${shortDay(d.day)}: ${d.why.join(", ")}`;

    if (m.span === "weeks") {
      const total = m.n * 7;
      const elapsed = Math.min(total, daysBetween(start, today) + 1);
      if (broke) return { ...base, marks, status: "broken", headline: `Broken on day ${daysBetween(start, broke.day) + 1} of ${total}`, progress: (daysBetween(start, broke.day) + 1) / total, detail: why(broke) };
      if (today > end) return { ...base, marks, status: "reached", reachedOn: addDays(end, 1), headline: `${plural(m.n, "week")}, no breaks`, progress: 1, detail: `${plural(marks.length, "trading day")}, every one inside the rules.` };
      return {
        ...base,
        marks,
        status: "going",
        headline: `Day ${elapsed} of ${total} · no breaks`,
        progress: elapsed / total,
        detail: `${plural(marks.length, "trading day")} kept so far. Ends ${shortDay(end)}.`,
      };
    }

    if (m.span === "inARow") {
      let run = 0;
      let best = 0;
      let reachedOn: string | null = null;
      let lastBreak: GoalDayMark | null = null;
      for (const d of marks) {
        if (d.ok) run++;
        else {
          run = 0;
          lastBreak = d;
        }
        best = Math.max(best, run);
        if (run >= m.n && !reachedOn) reachedOn = d.day;
      }
      if (reachedOn) return { marks, reachedOn, status: "reached", headline: `${m.n} / ${m.n} in a row`, progress: 1, detail: `Reached ${shortDay(reachedOn)}.` };
      if (late) return { ...base, marks, status: "broken", headline: `${run} / ${m.n} in a row · out of time`, progress: run / m.n, detail: best > run ? `Best run was ${best}.` : null };
      return {
        ...base,
        marks,
        status: "going",
        headline: `${run} / ${m.n} in a row`,
        progress: run / m.n,
        detail: lastBreak ? `Run reset ${why(lastBreak)}${best > run ? ` · best run ${best}` : ""}` : marks.length ? null : "Counts from your next trading day.",
      };
    }

    // total: days kept, breaks don't reset the count.
    const kept = marks.filter((d) => d.ok);
    const reachedOn = kept.length >= m.n ? kept[m.n - 1]!.day : null;
    if (reachedOn) return { marks, reachedOn, status: "reached", headline: `${m.n} / ${m.n} days kept`, progress: 1, detail: `Reached ${shortDay(reachedOn)}.` };
    const breaks = marks.length - kept.length;
    return {
      ...base,
      marks,
      status: late ? "broken" : "going",
      headline: `${kept.length} / ${m.n} days kept${late ? " · out of time" : ""}`,
      progress: kept.length / m.n,
      detail: breaks ? `${plural(breaks, "day")} broke it · last ${why([...marks].reverse().find((d) => !d.ok)!)}` : null,
    };
  }

  const trades = ctx.trades.filter((t) => dayKey(t.entryTime, ctx.tz) >= start).sort((a, b) => a.entryTime.localeCompare(b.entryTime));

  if (m.kind === "total") {
    const led = ctx.ledger.filter((e) => e.day >= start).sort((a, b) => a.day.localeCompare(b.day));
    // The running total, in order, so the day it was reached is known.
    const steps: { day: string; v: number }[] =
      m.metric === "net"
        ? trades.map((t) => ({ day: dayKey(t.entryTime, ctx.tz), v: t.netPnl }))
        : m.metric === "paidOut"
          ? led.filter((e) => e.kind === "payout").map((e) => ({ day: e.day, v: Math.max(0, e.amount) }))
          : led.filter((e) => e.kind === (m.metric === "payouts" ? "payout" : "passed")).map((e) => ({ day: e.day, v: qtyOf(e) }));
    let have = 0;
    let reachedOn: string | null = null;
    for (const s of steps) {
      have += s.v;
      if (!reachedOn && have >= m.target) reachedOn = s.day;
    }
    const shown = m.metric === "net" ? (have === 0 ? "$0" : fmtMoney(have, { sign: true })) : m.metric === "paidOut" ? fmtMoney(have) : String(have);
    const goal = m.metric === "net" || m.metric === "paidOut" ? fmtMoney(m.target) : String(m.target);
    if (reachedOn) return { ...base, reachedOn, status: "reached", headline: `${shown} of ${goal}`, progress: 1, detail: `Reached ${shortDay(reachedOn)}.` };
    const hint = m.metric === "net" ? "Counts every trade since it started." : "Counts what you log in Guardian's ledger since it started.";
    return { ...base, status: late ? "broken" : "going", headline: `${shown} of ${goal}${late ? " · out of time" : ""}`, progress: clamp01(have / m.target), detail: hint };
  }

  // rate: decided once the next N trades (or trading days) are in.
  const units =
    m.metric === "winRate"
      ? trades.map((t) => ({ day: dayKey(t.entryTime, ctx.tz), good: t.netPnl > 0 }))
      : [...trades.reduce((acc, t) => acc.set(dayKey(t.entryTime, ctx.tz), (acc.get(dayKey(t.entryTime, ctx.tz)) ?? 0) + t.netPnl), new Map<string, number>())].map(([day, n]) => ({ day, good: n > 0 }));
  const sample = units.slice(0, m.over);
  const good = sample.filter((u) => u.good).length;
  const rate = sample.length ? Math.round((good / sample.length) * 100) : 0;
  const word = m.metric === "winRate" ? "trade" : "trading day";
  if (sample.length >= m.over) {
    const met = rate >= m.target;
    return { ...base, reachedOn: met ? sample[sample.length - 1]!.day : null, status: met ? "reached" : "broken", headline: `${rate}% over ${plural(m.over, word)}`, progress: met ? 1 : clamp01(rate / m.target), detail: met ? null : `Needed ${m.target}%.` };
  }
  return {
    ...base,
    status: late ? "broken" : "going",
    headline: sample.length ? `${rate}% so far · ${sample.length} / ${m.over} ${word}s` : `0 / ${m.over} ${word}s`,
    progress: sample.length / m.over,
    detail: `Needs ${m.target}%. Decided after ${plural(m.over, word)}.`,
  };
}

/** Old goals stored only a clean-day count: read them as "keep all my rules on N trading days". */
export function legacyMeasure(autoCleanDays: number | null): GoalMeasure | null {
  return autoCleanDays ? { kind: "days", rules: [{ type: "myRules" }], span: "total", n: autoCleanDays } : null;
}

export const minutesOk = (s: string) => parseHHMM(s) !== null && parseHHMM(s)! < 24 * 60;
export const hhmm = (s: string) => fmtMinute(parseHHMM(s)!);
