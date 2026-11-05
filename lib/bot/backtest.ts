/**
 * The 2-year backtest (Expected_Trades_2yr_Nov2024_Nov2026.csv): every trade
 * the strategy would have taken, eval and funded, kept with the app so the
 * Track record has a long history next to the live weeks. Plus Topstep 50K
 * simulations from every start day: how often a Combine passes, and how often
 * a funded account reaches a $2,000 payout. Pure, so it's unit-tested.
 */
import raw from "./data/backtest-2y.json";
import type { HistTrade } from "./history";
import type { Session } from "./signal";

type Row = [string, string, string, string, string, string, number, number, number, number, string, number, number, number];
export type BtTrade = HistTrade & { day: string; mode: "eval" | "funded"; quiet: boolean; capped: boolean; reason: "target" | "stop" | "other" };

export const BACKTEST_SOURCE = raw.source;
export function backtestTrades(mode: "eval" | "funded"): BtTrade[] {
  return (raw.rows as Row[])
    .filter((r) => (r[0] === "e" ? "eval" : "funded") === mode)
    .map((r) => ({
      key: `bt|${r[0]}|${r[2]}|${r[5]}`,
      mode,
      day: r[1],
      entryAt: r[2].replace("Z", ":00.000Z"),
      exitAt: r[3].replace("Z", ":00.000Z"),
      session: r[4] as Session,
      dir: r[5] === "L" ? "LONG" : "SHORT",
      entry: r[6],
      stop: r[7],
      target: r[8],
      exit: r[9],
      reason: r[10] === "t" ? "target" : r[10] === "s" ? "stop" : "other",
      quiet: r[11] === 1,
      capped: r[12] === 1,
      qty: 5,
      pnl: r[13],
      account: mode === "eval" ? "Eval (3/3)" : "Funded (3/2)",
      symbol: "MNQ",
      signal: null,
    }));
}

/** Weekdays from a to b (trading days, holidays ignored). */
function weekdaysBetween(a: string, b: string): number {
  let n = 0;
  for (let t = Date.parse(`${a}T12:00:00Z`); t <= Date.parse(`${b}T12:00:00Z`); t += 86_400_000) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) n++;
  }
  return n;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
};

/** Daily P&L in order: [trading day, P&L]. */
function days(trades: BtTrade[]): [string, number][] {
  const m = new Map<string, number>();
  for (const t of trades) m.set(t.day, (m.get(t.day) ?? 0) + t.pnl);
  return [...m].sort(([a], [b]) => a.localeCompare(b));
}

export type SimResult = { starts: number; passed: number; failed: number; unfinished: number; rate: number | null; medianDays: number | null; fastDays: number | null; slowDays: number | null };

function summarise(outcomes: ("unfinished" | "failed" | number)[]): SimResult {
  const done = outcomes.filter((o) => o !== "unfinished");
  const times = outcomes.filter((o): o is number => typeof o === "number");
  const s = [...times].sort((a, b) => a - b);
  return {
    starts: outcomes.length,
    passed: times.length,
    failed: done.length - times.length,
    unfinished: outcomes.length - done.length,
    rate: done.length ? times.length / done.length : null,
    medianDays: median(times),
    fastDays: s.length ? s[Math.floor(s.length * 0.25)]! : null,
    slowDays: s.length ? s[Math.floor(s.length * 0.75)]! : null,
  };
}

/**
 * A Topstep 50K Combine started on each trading day: pass at +$3,000 with the
 * best day no more than 50% of the profit; fail when the balance touches the
 * trailing max loss ($2,000 under the highest end-of-day balance, never above
 * $50,000). Trades are checked as they close, so a deeper dip inside a trade
 * isn't seen: real results can be a little worse.
 */
export function combineSim(trades: BtTrade[], o = { target: 3000, mll: 2000, consistency: 0.5 }): SimResult {
  const d = days(trades);
  const byDay = new Map<string, BtTrade[]>();
  for (const t of trades) byDay.set(t.day, [...(byDay.get(t.day) ?? []), t]);
  const outcomes = d.map(([start]) => {
    let bal = 0, high = 0, best = 0;
    for (const [day, net] of d) {
      if (day < start) continue;
      const floor = Math.min(high - o.mll, 0);
      for (const t of byDay.get(day)!) {
        bal += t.pnl;
        if (bal <= floor) return "failed" as const;
      }
      best = Math.max(best, net);
      high = Math.max(high, bal);
      if (bal >= o.target && best <= o.consistency * bal) return weekdaysBetween(start, day);
    }
    return "unfinished" as const;
  });
  return summarise(outcomes);
}

/**
 * A funded (Express) 50K account started on each trading day: reaches a
 * $2,000 payout (the spec's rule: 5 winning days of $150+ and $4,000 profit)
 * before it touches the same trailing max loss.
 */
export function payoutSim(trades: BtTrade[], o = { winDays: 5, winDay: 150, profit: 4000, mll: 2000 }): SimResult {
  const d = days(trades);
  const byDay = new Map<string, BtTrade[]>();
  for (const t of trades) byDay.set(t.day, [...(byDay.get(t.day) ?? []), t]);
  const outcomes = d.map(([start]) => {
    let bal = 0, high = 0, wins = 0;
    for (const [day, net] of d) {
      if (day < start) continue;
      const floor = Math.min(high - o.mll, 0);
      for (const t of byDay.get(day)!) {
        bal += t.pnl;
        if (bal <= floor) return "failed" as const;
      }
      if (net >= o.winDay) wins++;
      high = Math.max(high, bal);
      if (wins >= o.winDays && bal >= o.profit) return weekdaysBetween(start, day);
    }
    return "unfinished" as const;
  });
  return summarise(outcomes);
}
