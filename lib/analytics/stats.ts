import type { Trade } from "../types";
import { dayKey, holdMinutes, minuteOfDay, weekdayIndex } from "./time";

export type Summary = {
  trades: number;
  wins: number;
  losses: number;
  scratches: number;
  winRate: number; // 0-1
  gross: number;
  fees: number;
  net: number;
  totalWon: number; // sum of winning trades (net)
  totalLost: number; // sum of losing trades (net, positive number)
  avgWin: number;
  avgLoss: number; // positive number
  payoff: number; // avgWin / avgLoss
  profitFactor: number; // totalWon / totalLost (Infinity if no losses)
  expectancy: number; // net per trade
  largestWin: number;
  largestLoss: number; // negative number
  maxDrawdown: number; // positive number
  longestWinStreak: number;
  longestLossStreak: number;
  avgHoldWin: number; // minutes
  avgHoldLoss: number;
  contracts: number;
  avgR: number | null;
  /** The average winner in R: your reward for 1R risked. */
  avgWinR: number | null;
};

const EMPTY: Summary = {
  trades: 0, wins: 0, losses: 0, scratches: 0, winRate: 0, gross: 0, fees: 0, net: 0,
  totalWon: 0, totalLost: 0, avgWin: 0, avgLoss: 0, payoff: 0, profitFactor: 0, expectancy: 0,
  largestWin: 0, largestLoss: 0, maxDrawdown: 0, longestWinStreak: 0, longestLossStreak: 0,
  avgHoldWin: 0, avgHoldLoss: 0, contracts: 0, avgR: null, avgWinR: null,
};

export function sortByExit(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => a.exitTime.localeCompare(b.exitTime) || a.id.localeCompare(b.id));
}

export function sortByEntry(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => a.entryTime.localeCompare(b.entryTime) || a.id.localeCompare(b.id));
}

/**
 * Your usual full loss on each account: the size most of your stop-outs come
 * to there (the 75th percentile of its losses, from 3 losses up). Copied
 * accounts trade different sizes, so each gets its own 1R. Keyed by account
 * (or source, for trades without one).
 */
export function usualRisks(trades: readonly Pick<Trade, "accountId" | "source" | "netPnl">[]): Map<string, number> {
  const losses = new Map<string, number[]>();
  for (const t of trades) if (t.netPnl < 0) losses.set(t.accountId ?? t.source, [...(losses.get(t.accountId ?? t.source) ?? []), -t.netPnl]);
  const out = new Map<string, number>();
  for (const [k, xs] of losses) {
    if (xs.length < 3) continue;
    xs.sort((a, b) => a - b);
    out.set(k, Math.round(xs[Math.floor(0.75 * (xs.length - 1))]! * 100) / 100);
  }
  return out;
}

/**
 * What was risked on a trade: what you typed; else your usual full loss on
 * that account (so a $20 scratch is a small part of 1R, a full stop is −1R);
 * else, on a loss, the loss itself; else your default risk per trade.
 */
export function riskFor(t: Pick<Trade, "plannedRisk" | "netPnl">, defaultRisk: number | null, usual?: number | null): number | null {
  if (t.plannedRisk != null && t.plannedRisk > 0) return t.plannedRisk;
  if (usual != null && usual > 0) return usual;
  if (t.netPnl < 0) return Math.round(-t.netPnl * 100) / 100;
  return defaultRisk;
}

export function rMultiple(t: Trade, defaultRisk: number | null, usual?: number | null): number | null {
  const risk = riskFor(t, defaultRisk, usual);
  if (!risk || risk <= 0) return null;
  return t.netPnl / risk;
}

export function summarize(input: Trade[], defaultRisk: number | null = null): Summary {
  if (input.length === 0) return { ...EMPTY };
  const trades = sortByExit(input);
  let wins = 0, losses = 0, scratches = 0, gross = 0, fees = 0, net = 0;
  let totalWon = 0, totalLost = 0, largestWin = 0, largestLoss = 0;
  let cum = 0, peak = 0, maxDd = 0;
  let streakW = 0, streakL = 0, bestW = 0, bestL = 0;
  let holdW = 0, holdL = 0, contracts = 0;
  let rSum = 0, rN = 0, winR = 0, winRN = 0;
  const usual = usualRisks(trades);

  for (const t of trades) {
    gross += t.grossPnl;
    fees += t.fees;
    net += t.netPnl;
    contracts += t.qty;
    const hold = holdMinutes(t.entryTime, t.exitTime);
    if (t.netPnl > 0) {
      wins++; totalWon += t.netPnl; holdW += hold;
      largestWin = Math.max(largestWin, t.netPnl);
      streakW++; streakL = 0; bestW = Math.max(bestW, streakW);
    } else if (t.netPnl < 0) {
      losses++; totalLost += -t.netPnl; holdL += hold;
      largestLoss = Math.min(largestLoss, t.netPnl);
      streakL++; streakW = 0; bestL = Math.max(bestL, streakL);
    } else {
      scratches++;
    }
    cum += t.netPnl;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
    const r = rMultiple(t, defaultRisk, usual.get(t.accountId ?? t.source));
    if (r !== null) { rSum += r; rN++; if (r > 0) { winR += r; winRN++; } }
  }

  const avgWin = wins ? totalWon / wins : 0;
  const avgLoss = losses ? totalLost / losses : 0;
  return {
    trades: trades.length,
    wins, losses, scratches,
    winRate: trades.length ? wins / trades.length : 0,
    gross, fees, net, totalWon, totalLost, avgWin, avgLoss,
    payoff: avgLoss ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0,
    profitFactor: totalLost ? totalWon / totalLost : totalWon > 0 ? Infinity : 0,
    expectancy: net / trades.length,
    largestWin, largestLoss,
    maxDrawdown: maxDd,
    longestWinStreak: bestW,
    longestLossStreak: bestL,
    avgHoldWin: wins ? holdW / wins : 0,
    avgHoldLoss: losses ? holdL / losses : 0,
    contracts,
    avgR: rN ? rSum / rN : null,
    avgWinR: winRN ? winR / winRN : null,
  };
}

export type DayStat = { day: string; net: number; trades: number; wins: number; losses: number; cum: number };

export function dailySeries(trades: Trade[], tz: string): DayStat[] {
  const map = new Map<string, DayStat>();
  for (const t of trades) {
    const day = dayKey(t.exitTime, tz);
    const d = map.get(day) ?? { day, net: 0, trades: 0, wins: 0, losses: 0, cum: 0 };
    d.net += t.netPnl;
    d.trades++;
    if (t.netPnl > 0) d.wins++;
    else if (t.netPnl < 0) d.losses++;
    map.set(day, d);
  }
  const days = [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  let cum = 0;
  for (const d of days) { cum += d.net; d.cum = cum; }
  return days;
}

export type DaySummary = {
  tradingDays: number;
  greenDays: number;
  redDays: number;
  bestDay: DayStat | null;
  worstDay: DayStat | null;
  avgDay: number;
  dayStdDev: number;
  bestDayShare: number | null; // best day / total net (only when net > 0)
};

export function summarizeDays(days: DayStat[]): DaySummary {
  if (!days.length) {
    return { tradingDays: 0, greenDays: 0, redDays: 0, bestDay: null, worstDay: null, avgDay: 0, dayStdDev: 0, bestDayShare: null };
  }
  let best = days[0]!, worst = days[0]!, total = 0;
  for (const d of days) {
    if (d.net > best.net) best = d;
    if (d.net < worst.net) worst = d;
    total += d.net;
  }
  const avg = total / days.length;
  const variance = days.reduce((s, d) => s + (d.net - avg) ** 2, 0) / days.length;
  return {
    tradingDays: days.length,
    greenDays: days.filter((d) => d.net > 0).length,
    redDays: days.filter((d) => d.net < 0).length,
    bestDay: best,
    worstDay: worst,
    avgDay: avg,
    dayStdDev: Math.sqrt(variance),
    bestDayShare: total > 0 && best.net > 0 ? best.net / total : null,
  };
}

export type CurvePoint = { t: string; cum: number; net: number };

export function equityCurve(trades: Trade[]): CurvePoint[] {
  let cum = 0;
  return sortByExit(trades).map((t) => {
    cum += t.netPnl;
    return { t: t.exitTime, cum, net: t.netPnl };
  });
}

export type Bucket = {
  key: string;
  label: string;
  trades: number;
  wins: number;
  net: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  sort: number;
};

type BucketKey = { key: string; label: string; sort: number };

/** keyFn may return several keys (a trade tagged with two setups counts in both). */
export function bucketize(trades: Trade[], keyFn: (t: Trade) => BucketKey | BucketKey[] | null): Bucket[] {
  const map = new Map<string, { b: Bucket; won: number; lost: number }>();
  for (const t of trades) {
    const ks = keyFn(t);
    for (const k of ks === null ? [] : Array.isArray(ks) ? ks : [ks]) {
    const entry = map.get(k.key) ?? {
      b: { key: k.key, label: k.label, trades: 0, wins: 0, net: 0, winRate: 0, expectancy: 0, profitFactor: 0, sort: k.sort },
      won: 0,
      lost: 0,
    };
    entry.b.trades++;
    entry.b.net += t.netPnl;
    if (t.netPnl > 0) { entry.b.wins++; entry.won += t.netPnl; }
    else if (t.netPnl < 0) entry.lost += -t.netPnl;
    map.set(k.key, entry);
    }
  }
  return [...map.values()]
    .map(({ b, won, lost }) => ({
      ...b,
      winRate: b.trades ? b.wins / b.trades : 0,
      expectancy: b.trades ? b.net / b.trades : 0,
      profitFactor: lost ? won / lost : won > 0 ? Infinity : 0,
    }))
    .sort((a, b) => a.sort - b.sort);
}

export const byHour = (trades: Trade[], tz: string) =>
  bucketize(trades, (t) => {
    const h = Math.floor(minuteOfDay(t.entryTime, tz) / 60);
    return { key: String(h), label: `${String(h).padStart(2, "0")}:00`, sort: h };
  });

export const byWeekday = (trades: Trade[], tz: string) =>
  bucketize(trades, (t) => {
    const w = weekdayIndex(dayKey(t.entryTime, tz));
    return { key: String(w), label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][w]!, sort: w };
  });

export const bySymbol = (trades: Trade[]) =>
  bucketize(trades, (t) => ({ key: t.root, label: t.root, sort: 0 })).sort((a, b) => b.trades - a.trades);

export const bySetup = (trades: Trade[]) =>
  bucketize(trades, (t) => t.setups.map((s) => ({ key: s, label: s, sort: 0 }))).sort((a, b) => b.trades - a.trades);

export const byEmotion = (trades: Trade[]) =>
  bucketize(trades, (t) => (t.emotion ? { key: t.emotion, label: t.emotion, sort: 0 } : null)).sort((a, b) => b.trades - a.trades);

export const byDirection = (trades: Trade[]) =>
  bucketize(trades, (t) => ({ key: t.direction, label: t.direction === "long" ? "Long" : "Short", sort: t.direction === "long" ? 0 : 1 }));

const HOLD_BUCKETS: [number, string][] = [
  [1, "< 1m"], [5, "1–5m"], [15, "5–15m"], [60, "15–60m"], [240, "1–4h"], [Infinity, "4h+"],
];

export const byHoldTime = (trades: Trade[]) =>
  bucketize(trades, (t) => {
    const m = holdMinutes(t.entryTime, t.exitTime);
    const i = HOLD_BUCKETS.findIndex(([max]) => m < max);
    return { key: String(i), label: HOLD_BUCKETS[i]![1], sort: i };
  });

/** Performance of the 1st, 2nd, 3rd… trade of each day. */
export function byTradeNumber(trades: Trade[], tz: string): Bucket[] {
  const perDay = new Map<string, Trade[]>();
  for (const t of trades) {
    const d = dayKey(t.entryTime, tz);
    perDay.set(d, [...(perDay.get(d) ?? []), t]);
  }
  const indexOf = new Map<string, number>();
  for (const list of perDay.values()) {
    sortByEntry(list).forEach((t, i) => indexOf.set(t.id, i + 1));
  }
  return bucketize(trades, (t) => {
    const n = Math.min(indexOf.get(t.id) ?? 1, 5);
    return { key: String(n), label: n === 5 ? "5th+" : ["", "1st", "2nd", "3rd", "4th"][n]!, sort: n };
  });
}

export function byMistake(trades: Trade[]): Bucket[] {
  const rows: Bucket[] = [];
  const names = new Set(trades.flatMap((t) => t.mistakes));
  for (const name of names) {
    const subset = trades.filter((t) => t.mistakes.includes(name));
    const b = bucketize(subset, () => ({ key: name, label: name, sort: 0 }))[0];
    if (b) rows.push(b);
  }
  return rows.sort((a, b) => a.net - b.net);
}

export function inRange(trades: Trade[], tz: string, start: string, end: string): Trade[] {
  return trades.filter((t) => {
    const d = dayKey(t.exitTime, tz);
    return d >= start && d <= end;
  });
}
