import type { PropSettings, Trade } from "../types";
import { dailySeries } from "./stats";
import { dayKey } from "./time";

export const PROP_PRESETS: Record<"50K" | "100K" | "150K", Omit<PropSettings, "enabled" | "firm" | "phase" | "startDate" | "accountIds" | "preset">> = {
  "50K": { startBalance: 50_000, profitTarget: 3_000, maxLossLimit: 2_000, dailyLossLimit: 1_000, consistencyPct: 50, maxContracts: 5 },
  "100K": { startBalance: 100_000, profitTarget: 6_000, maxLossLimit: 3_000, dailyLossLimit: 2_000, consistencyPct: 50, maxContracts: 10 },
  "150K": { startBalance: 150_000, profitTarget: 9_000, maxLossLimit: 4_500, dailyLossLimit: 3_000, consistencyPct: 50, maxContracts: 15 },
};

export type PropStatus = {
  balance: number;
  profit: number;
  highWater: number; // highest end-of-day balance
  floor: number; // current trailing max-loss level
  cushion: number; // balance - floor
  cushionPct: number; // cushion / maxLossLimit
  todayPnl: number;
  dailyLossUsed: number | null; // 0-1
  targetProgress: number | null; // 0-1
  bestDay: number;
  consistencyShare: number | null; // best day / profit
  consistencyOk: boolean | null;
  requiredProfit: number | null; // target adjusted for consistency
  tradingDays: number;
  avgDay: number;
  daysToTarget: number | null;
  breached: boolean;
  dailyPnls: number[];
};

/**
 * Replays the account day by day with an end-of-day trailing max loss that
 * locks at the starting balance (Topstep-style).
 */
export function propStatus(trades: Trade[], prop: PropSettings, tz: string): PropStatus {
  const scoped = trades.filter((t) => {
    if (dayKey(t.exitTime, tz) < prop.startDate) return false;
    if (prop.accountIds.length && (!t.accountId || !prop.accountIds.includes(t.accountId))) return false;
    return true;
  });
  const days = dailySeries(scoped, tz);
  const today = dayKey(new Date(), tz);
  let balance = prop.startBalance;
  let highWater = prop.startBalance;
  let floor = prop.startBalance - prop.maxLossLimit;
  let breached = false;
  let bestDay = 0;
  for (const d of days) {
    balance += d.net;
    if (balance <= floor) breached = true;
    if (d.day !== today) {
      highWater = Math.max(highWater, balance);
      floor = Math.min(highWater - prop.maxLossLimit, prop.startBalance);
    }
    bestDay = Math.max(bestDay, d.net);
  }
  const profit = balance - prop.startBalance;
  const todayPnl = days.find((d) => d.day === today)?.net ?? 0;
  const consistencyShare = profit > 0 && bestDay > 0 ? bestDay / profit : null;
  const pct = prop.consistencyPct ? prop.consistencyPct / 100 : null;
  const requiredProfit =
    prop.profitTarget != null ? Math.max(prop.profitTarget, pct && bestDay > 0 ? bestDay / pct : 0) : null;
  const avgDay = days.length ? days.reduce((s, d) => s + d.net, 0) / days.length : 0;
  const remaining = requiredProfit != null ? requiredProfit - profit : null;

  return {
    balance,
    profit,
    highWater,
    floor,
    cushion: balance - floor,
    cushionPct: prop.maxLossLimit ? (balance - floor) / prop.maxLossLimit : 0,
    todayPnl,
    dailyLossUsed: prop.dailyLossLimit ? Math.min(1, Math.max(0, -todayPnl / prop.dailyLossLimit)) : null,
    targetProgress: requiredProfit ? Math.max(0, Math.min(1, profit / requiredProfit)) : null,
    bestDay,
    consistencyShare,
    consistencyOk: pct && consistencyShare !== null ? consistencyShare <= pct : null,
    requiredProfit,
    tradingDays: days.length,
    avgDay,
    daysToTarget: remaining != null && remaining > 0 && avgDay > 0 ? Math.ceil(remaining / avgDay) : remaining != null && remaining <= 0 ? 0 : null,
    breached,
    dailyPnls: days.map((d) => d.net),
  };
}

export type MonteCarloResult = {
  sims: number;
  horizon: number;
  passProb: number;
  bustProb: number;
  openProb: number;
  medianDaysToPass: number | null;
  bands: { day: number; p10: number; p50: number; p90: number }[];
};

/** Small deterministic PRNG so results don't flicker between renders. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bootstraps the trader's own daily P&L distribution to estimate the odds of
 * passing (or blowing) the evaluation from the current state.
 */
export function simulateProp(
  status: PropStatus,
  prop: PropSettings,
  opts: { sims?: number; horizon?: number; seed?: number } = {},
): MonteCarloResult | null {
  const sample = status.dailyPnls.slice(-60);
  if (sample.length < 5) return null;
  const sims = opts.sims ?? 4000;
  const horizon = opts.horizon ?? 30;
  const rand = mulberry32(opts.seed ?? 1337);
  const pct = prop.consistencyPct ? prop.consistencyPct / 100 : null;
  let pass = 0, bust = 0;
  const passDays: number[] = [];
  const paths: Float64Array[] = Array.from({ length: horizon + 1 }, () => new Float64Array(sims));

  for (let s = 0; s < sims; s++) {
    let balance = status.balance;
    let hw = status.highWater;
    let floor = status.floor;
    let best = status.bestDay;
    let done = false;
    paths[0]![s] = balance;
    for (let d = 1; d <= horizon; d++) {
      if (!done) {
        let pnl = sample[Math.floor(rand() * sample.length)]!;
        if (prop.dailyLossLimit && pnl < -prop.dailyLossLimit) pnl = -prop.dailyLossLimit;
        balance += pnl;
        best = Math.max(best, pnl);
        if (balance <= floor) {
          bust++;
          done = true;
        } else {
          hw = Math.max(hw, balance);
          floor = Math.min(hw - prop.maxLossLimit, prop.startBalance);
          const profit = balance - prop.startBalance;
          if (prop.profitTarget != null && profit >= prop.profitTarget && (!pct || best <= pct * profit)) {
            pass++;
            passDays.push(d);
            done = true;
          }
        }
      }
      paths[d]![s] = balance;
    }
  }

  const bands = paths.map((col, day) => {
    const sorted = Array.from(col).sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
    return { day, p10: q(0.1), p50: q(0.5), p90: q(0.9) };
  });
  passDays.sort((a, b) => a - b);

  return {
    sims,
    horizon,
    passProb: pass / sims,
    bustProb: bust / sims,
    openProb: (sims - pass - bust) / sims,
    medianDaysToPass: passDays.length ? passDays[Math.floor(passDays.length / 2)]! : null,
    bands,
  };
}
