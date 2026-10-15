import type { Trade } from "../types";
import { dailySeries, sortByEntry, summarize, type Summary } from "./stats";
import { dayKey, minuteOfDay, weekdayIndex } from "./time";
import { detectTilt } from "./tilt";

export type WhatIfOptions = {
  maxTradesPerDay?: number | null;
  stopAfterLosses?: number | null;
  maxDailyLoss?: number | null;
  dailyProfitStop?: number | null;
  windowStart?: number | null; // minute of day
  windowEnd?: number | null;
  excludeWeekdays?: number[];
  excludeSymbols?: string[];
  excludeSetups?: string[];
  skipMistakeTagged?: boolean;
  skipTilt?: boolean;
  direction?: "both" | "long" | "short";
};

export type WhatIfResult = {
  kept: Trade[];
  removedCount: number;
  actual: Summary;
  ghost: Summary;
  delta: number;
  actualCurve: { day: string; cum: number }[];
  ghostCurve: { day: string; cum: number }[];
};

/**
 * The Ghost Curve: replays your real trades under a different rule set,
 * honouring the order trades actually happened in (e.g. "stop after 2
 * losses" drops every later trade that day).
 */
export function runWhatIf(trades: Trade[], opts: WhatIfOptions, tz: string): WhatIfResult {
  const tiltIds = opts.skipTilt ? detectTilt(trades, tz).flaggedIds : null;

  // 1) Static filters that don't depend on sequence.
  const prefiltered = trades.filter((t) => {
    const day = dayKey(t.entryTime, tz);
    if (opts.excludeWeekdays?.includes(weekdayIndex(day))) return false;
    if (opts.excludeSymbols?.includes(t.root)) return false;
    if (t.setup && opts.excludeSetups?.includes(t.setup)) return false;
    if (opts.skipMistakeTagged && t.mistakes.length > 0) return false;
    if (tiltIds?.has(t.id)) return false;
    if (opts.direction && opts.direction !== "both" && t.direction !== opts.direction) return false;
    if (opts.windowStart != null && opts.windowEnd != null) {
      const m = minuteOfDay(t.entryTime, tz);
      if (m < opts.windowStart || m >= opts.windowEnd) return false;
    }
    return true;
  });

  // 2) Sequential daily stops.
  const perDay = new Map<string, Trade[]>();
  for (const t of prefiltered) {
    const d = dayKey(t.entryTime, tz);
    const list = perDay.get(d);
    if (list) list.push(t);
    else perDay.set(d, [t]);
  }
  const kept: Trade[] = [];
  for (const list of perDay.values()) {
    let count = 0, cum = 0, streak = 0;
    for (const t of sortByEntry(list)) {
      if (opts.maxTradesPerDay && count >= opts.maxTradesPerDay) break;
      if (opts.stopAfterLosses && streak >= opts.stopAfterLosses) break;
      if (opts.maxDailyLoss && cum <= -opts.maxDailyLoss) break;
      if (opts.dailyProfitStop && cum >= opts.dailyProfitStop) break;
      kept.push(t);
      count++;
      cum += t.netPnl;
      streak = t.netPnl < 0 ? streak + 1 : 0;
    }
  }

  const actual = summarize(trades);
  const ghost = summarize(kept);
  const actualDays = dailySeries(trades, tz);
  const ghostMap = new Map(dailySeries(kept, tz).map((d) => [d.day, d.net]));
  let g = 0;
  const ghostCurve = actualDays.map((d) => {
    g += ghostMap.get(d.day) ?? 0;
    return { day: d.day, cum: g };
  });

  return {
    kept,
    removedCount: trades.length - kept.length,
    actual,
    ghost,
    delta: ghost.net - actual.net,
    actualCurve: actualDays.map((d) => ({ day: d.day, cum: d.cum })),
    ghostCurve,
  };
}

export type RuleSuggestion = { label: string; opts: WhatIfOptions; delta: number; removed: number; ghostNet: number };

/**
 * Searches a small, deliberately simple grid of single rules and returns the
 * ones that would have helped most. Rules that remove more than half of all
 * trades are ignored — they're curve-fitting, not discipline.
 */
export function suggestRules(trades: Trade[], tz: string): RuleSuggestion[] {
  if (trades.length < 15) return [];
  const candidates: { label: string; opts: WhatIfOptions }[] = [];
  for (const n of [1, 2, 3]) candidates.push({ label: `Stop after ${n} loss${n > 1 ? "es" : ""} in a row`, opts: { stopAfterLosses: n } });
  for (const n of [2, 3, 4, 5]) candidates.push({ label: `Max ${n} trades a day`, opts: { maxTradesPerDay: n } });
  candidates.push({ label: "Skip trades tagged with a mistake", opts: { skipMistakeTagged: true } });
  candidates.push({ label: "Sit out revenge trades", opts: { skipTilt: true } });
  for (let w = 0; w < 5; w++) {
    candidates.push({ label: `Don't trade ${["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays"][w]}`, opts: { excludeWeekdays: [w] } });
  }

  const days = dailySeries(trades, tz).map((d) => d.net).filter((n) => n > 0).sort((a, b) => a - b);
  if (days.length >= 5) {
    const p75 = days[Math.floor(days.length * 0.75)]!;
    const stop = Math.round(p75 / 50) * 50;
    if (stop > 0) candidates.push({ label: `Walk away once up $${stop} on the day`, opts: { dailyProfitStop: stop } });
  }

  // Cut-off times: only trade before X.
  const mins = trades.map((t) => minuteOfDay(t.entryTime, tz)).sort((a, b) => a - b);
  const first = mins[0] ?? 0;
  for (const cutoff of [600, 630, 660, 690, 720]) {
    if (cutoff > first + 30) {
      const h = Math.floor(cutoff / 60), m = cutoff % 60;
      candidates.push({
        label: `Stop trading at ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        opts: { windowStart: 0, windowEnd: cutoff },
      });
    }
  }

  const results: RuleSuggestion[] = [];
  for (const c of candidates) {
    const r = runWhatIf(trades, c.opts, tz);
    if (r.removedCount === 0 || r.removedCount > trades.length / 2) continue;
    if (r.delta <= 0) continue;
    results.push({ label: c.label, opts: c.opts, delta: r.delta, removed: r.removedCount, ghostNet: r.ghost.net });
  }
  return results.sort((a, b) => b.delta - a.delta).slice(0, 5);
}
