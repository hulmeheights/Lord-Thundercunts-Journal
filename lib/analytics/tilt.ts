import type { Trade } from "../types";
import { summarize, sortByEntry } from "./stats";
import { dayKey } from "./time";

export type TiltFlag = {
  tradeId: string;
  day: string;
  severity: 1 | 2 | 3;
  reasons: string[];
  netPnl: number;
  minutesAfterLoss: number;
};

export type TiltReport = {
  flags: TiltFlag[];
  flaggedIds: Set<string>;
  tiltCost: number; // net P&L of flagged trades
  flaggedWinRate: number;
  cleanWinRate: number;
  afterLoss: { trades: number; expectancy: number; winRate: number };
  afterWin: { trades: number; expectancy: number; winRate: number };
  overtradingDays: { day: string; trades: number; net: number }[];
  tiltiestDay: { day: string; flags: number; net: number } | null;
  medianReentryAfterLoss: number | null; // minutes
};

const QUICK_REENTRY_MIN = 5;

/**
 * Tilt Radar — detects emotional trading from behaviour alone:
 * fast re-entries after a loss, sizing up after a loss, and trading deep into
 * a losing streak. Each signal adds severity.
 */
export function detectTilt(trades: Trade[], tz: string): TiltReport {
  // Per account and day: copies of one trade on several accounts aren't a re-entry or a streak.
  const perDay = new Map<string, Trade[]>();
  for (const t of trades) {
    const d = `${dayKey(t.entryTime, tz)}\u0000${t.accountId ?? t.source}`;
    const list = perDay.get(d);
    if (list) list.push(t);
    else perDay.set(d, [t]);
  }

  const flags: TiltFlag[] = [];
  const afterLoss: Trade[] = [];
  const afterWin: Trade[] = [];
  const reentryGaps: number[] = [];

  for (const [key, list] of perDay) {
    const day = key.split("\u0000")[0]!;
    const ts = sortByEntry(list);
    let lossStreak = 0;
    for (let i = 0; i < ts.length; i++) {
      const cur = ts[i]!;
      if (i > 0) {
        const prev = ts[i - 1]!;
        const gap = (new Date(cur.entryTime).getTime() - new Date(prev.exitTime).getTime()) / 60_000;
        if (prev.netPnl < 0) {
          afterLoss.push(cur);
          reentryGaps.push(Math.max(0, gap));
          const reasons: string[] = [];
          if (gap < QUICK_REENTRY_MIN) reasons.push(`Re-entered ${Math.max(0, Math.round(gap))}m after a loss`);
          if (cur.qty > prev.qty) reasons.push(`Sized up ${prev.qty}→${cur.qty} after a loss`);
          if (lossStreak >= 2) reasons.push(`${lossStreak} losses in a row before this trade`);
          if (reasons.length) {
            flags.push({
              tradeId: cur.id,
              day,
              severity: Math.min(3, reasons.length) as 1 | 2 | 3,
              reasons,
              netPnl: cur.netPnl,
              minutesAfterLoss: Math.max(0, gap),
            });
          }
        } else if (prev.netPnl > 0) {
          afterWin.push(cur);
        }
      }
      lossStreak = cur.netPnl < 0 ? lossStreak + 1 : 0;
    }
  }

  const flaggedIds = new Set(flags.map((f) => f.tradeId));
  const flagged = trades.filter((t) => flaggedIds.has(t.id));
  const clean = trades.filter((t) => !flaggedIds.has(t.id));
  const sl = summarize(afterLoss);
  const sw = summarize(afterWin);

  const counts = [...perDay.values()].map((l) => l.length).sort((a, b) => a - b);
  const median = counts.length ? counts[Math.floor(counts.length / 2)]! : 0;
  const overtradingDays = [...perDay.entries()]
    .filter(([, l]) => median > 0 && l.length >= Math.max(4, median * 2))
    .map(([key, l]) => ({ day: key.split("\u0000")[0]!, trades: l.length, net: l.reduce((s, t) => s + t.netPnl, 0) }))
    .sort((a, b) => a.day.localeCompare(b.day))
    // One entry per day, even when several accounts overtraded the same day.
    .filter((o, i, all) => i === 0 || all[i - 1]!.day !== o.day);

  const flagsByDay = new Map<string, { flags: number; net: number }>();
  for (const f of flags) {
    const e = flagsByDay.get(f.day) ?? { flags: 0, net: 0 };
    e.flags += f.severity;
    e.net += f.netPnl;
    flagsByDay.set(f.day, e);
  }
  let tiltiestDay: TiltReport["tiltiestDay"] = null;
  for (const [day, e] of flagsByDay) {
    if (!tiltiestDay || e.flags > tiltiestDay.flags) tiltiestDay = { day, ...e };
  }

  const gaps = [...reentryGaps].sort((a, b) => a - b);

  return {
    flags,
    flaggedIds,
    tiltCost: flagged.reduce((s, t) => s + t.netPnl, 0),
    flaggedWinRate: summarize(flagged).winRate,
    cleanWinRate: summarize(clean).winRate,
    afterLoss: { trades: sl.trades, expectancy: sl.expectancy, winRate: sl.winRate },
    afterWin: { trades: sw.trades, expectancy: sw.expectancy, winRate: sw.winRate },
    overtradingDays,
    tiltiestDay,
    medianReentryAfterLoss: gaps.length ? gaps[Math.floor(gaps.length / 2)]! : null,
  };
}
