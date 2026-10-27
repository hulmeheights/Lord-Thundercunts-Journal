/**
 * The mission follows your goals. While a trading goal with day rules is
 * running (e.g. "only enter 14:30–16:00 for 2 weeks"), each day it covers is
 * judged by that goal's rules alone, so a clean day means exactly what you
 * ticked. Days no goal covers fall back to the rules chosen for the mission.
 */
import type { Trade, TradingRules } from "../types";
import type { RuleId } from "./rules";
import { goalTrades, judgeDays, type GoalMeasure } from "./goalcheck";
import { missionDays, type MissionDay } from "./mission";
import { addDays, dayKey } from "./time";

export type MissionGoal = { measure: GoalMeasure | null; startedOn: string | null; createdAt: string; completedAt: string | null; failedAt?: string | null; targetDay: string | null; kind: "trading" | "life" };

/** The days a goal is judging: from its start to its end (weeks / until), its date, or the day it was reached. */
function covers(g: MissionGoal, tz: string): { from: string; to: string | null } | null {
  const m = g.measure;
  if (g.kind !== "trading" || !m || m.kind !== "days") return null;
  const from = g.startedOn ?? dayKey(g.createdAt, tz);
  let to: string | null = m.span === "weeks" ? addDays(from, m.n * 7 - 1) : m.span === "until" ? (m.until ?? null) : g.targetDay;
  // A goal stops judging the mission once it's reached or you've marked it failed.
  for (const at of [g.completedAt, g.failedAt]) {
    if (!at) continue;
    const done = dayKey(at, tz);
    to = to === null || done < to ? done : to;
  }
  return { from, to };
}

export function missionDaysWithGoals(trades: Trade[], rules: TradingRules, tz: string, from: string, today: string, counts: readonly RuleId[] | undefined, goals: readonly MissionGoal[]): MissionDay[] {
  const base = missionDays(trades, rules, tz, from, today, counts);
  // Each goal's verdict on each day it covers.
  const judged = new Map<string, string[]>();
  const covered = new Set<string>();
  for (const g of goals) {
    const c = covers(g, tz);
    if (!c) continue;
    const a = c.from > from ? c.from : from;
    const b = c.to === null || c.to > today ? today : c.to;
    if (a > b) continue;
    for (let d = a; d <= b; d = addDays(d, 1)) covered.add(d);
    for (const mark of judgeDays(goalTrades(trades, g.measure!, tz), (g.measure as Extract<GoalMeasure, { kind: "days" }>).rules, rules, tz, a, b)) {
      judged.set(mark.day, [...new Set([...(judged.get(mark.day) ?? []), ...mark.why])]);
    }
  }
  return base.map((d) => {
    if (!covered.has(d.day)) return d;
    const why = judged.get(d.day) ?? [];
    return { ...d, reasons: why, kind: why.length ? "leak" : d.trades ? "burn" : "hold" };
  });
}
