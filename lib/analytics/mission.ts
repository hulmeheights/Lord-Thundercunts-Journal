/**
 * The Mission: one rocket, flown by your discipline. Every weekday since the
 * mission began is read from your trades: a day traded only inside your window
 * and within your stops is a full burn, a day you sat out still holds altitude,
 * and a day that broke the window or the stops leaks fuel. Steps you log and
 * goals you reach lift it too. Pure functions, so the maths is unit-tested.
 */
import type { Trade, TradingRules } from "../types";
import { evaluateRules, type RuleId } from "./rules";
import { addDays, dayKey, weekdayIndex } from "./time";

export type DayKind = "burn" | "hold" | "leak";
export type MissionDay = { day: string; kind: DayKind; net: number; trades: number; reasons: string[] };

/** The rules that decide a clean day: when you trade, and when you stop. */
const DISCIPLINE: RuleId[] = ["session", "maxTrades", "maxDailyLoss", "stopAfterLosses"];
const REASON: Partial<Record<RuleId, string>> = {
  session: "outside your window",
  maxTrades: "over your trade limit",
  maxDailyLoss: "past your daily loss limit",
  stopAfterLosses: "kept going after your losing streak",
};

export const FUEL = { burn: 3, hold: 1, leak: -2, step: 1, goal: 5 } as const;

export function missionDays(trades: Trade[], rules: TradingRules, tz: string, from: string, today: string): MissionDay[] {
  const inRange = trades.filter((t) => {
    const d = dayKey(t.entryTime, tz);
    return d >= from && d <= today;
  });
  const report = evaluateRules(inRange, rules, tz);
  const byDay = new Map<string, { net: number; trades: number }>();
  for (const t of inRange) {
    const d = dayKey(t.entryTime, tz);
    const cur = byDay.get(d) ?? { net: 0, trades: 0 };
    cur.net += t.netPnl;
    cur.trades++;
    byDay.set(d, cur);
  }
  const reasons = new Map<string, Set<string>>();
  for (const v of report.violations) {
    if (!DISCIPLINE.includes(v.rule)) continue;
    const set = reasons.get(v.day) ?? new Set<string>();
    set.add(REASON[v.rule]!);
    reasons.set(v.day, set);
  }
  const out: MissionDay[] = [];
  for (let d = from; d <= today && out.length < 2000; d = addDays(d, 1)) {
    const traded = byDay.get(d);
    const weekend = weekdayIndex(d) >= 5;
    if (weekend && !traded) continue;
    const why = [...(reasons.get(d) ?? [])];
    out.push({
      day: d,
      kind: why.length ? "leak" : traded ? "burn" : "hold",
      net: Math.round((traded?.net ?? 0) * 100) / 100,
      trades: traded?.trades ?? 0,
      reasons: why,
    });
  }
  return out;
}

export type MissionState = {
  altitude: number;
  /** Clean days in a row, counting back from the most recent (sat-out days keep it alive). */
  streak: number;
  burns: number;
  holds: number;
  leaks: number;
  days: MissionDay[];
};

export function missionState(days: MissionDay[], steps: number, goalsReached: number): MissionState {
  let altitude = 0;
  for (const d of days) altitude = Math.max(0, altitude + FUEL[d.kind]);
  altitude += steps * FUEL.step + goalsReached * FUEL.goal;
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i]!.kind === "leak") break;
    if (days[i]!.kind === "burn") streak++;
  }
  return {
    altitude,
    streak,
    burns: days.filter((d) => d.kind === "burn").length,
    holds: days.filter((d) => d.kind === "hold").length,
    leaks: days.filter((d) => d.kind === "leak").length,
    days,
  };
}

/** Clean trading days since a day: what an automatic trading goal counts. */
export function cleanDaysSince(days: MissionDay[], since: string): number {
  return days.filter((d) => d.day >= since && d.kind === "burn").length;
}
