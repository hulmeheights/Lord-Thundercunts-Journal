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

// ── Sets of 5, run along the real two years ─────────────────────────────────

export type SetEvent = { day: string; kind: "bought" | "passed" | "failed" | "payout" | "busted" | "live"; note: string };
export type SetMonth = { month: string; fees: number; paid: number; net: number; total: number; payouts: number };
export type SetsRun = { events: SetEvent[]; months: SetMonth[]; fees: number; paid: number; net: number; sets: number; payoutDays: number; firstPayout: string | null; lowest: number };

const nextWeekday = (d: string) => {
  let t = Date.parse(`${d}T12:00:00Z`) + 86_400_000;
  while ([0, 6].includes(new Date(t).getUTCDay())) t += 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
};
const calDays = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) + 1;

/**
 * Buy a set of N Combines, all copying the bot: they pass or fail together. A
 * passed set trades funded, taking a payout ($2,000 per account, $1,800 to you)
 * each time it has 5 new winning days of $150+ and $4,000 profit, until it
 * busts. A new set is bought only once the whole set has failed or busted.
 * Fees: monthly per account while in evaluation. Same rules as combineSim / payoutSim.
 */
export function setsRun(evalT: BtTrade[], fundedT: BtTrade[], o: { accounts?: number; monthly?: number; keep?: number; from?: string; to?: string; liveAfter?: number | null } = {}): SetsRun {
  const accounts = o.accounts ?? 5, monthly = o.monthly ?? 120, keep = o.keep ?? 1800;
  // Topstep usually calls you up to Live around the 3rd–5th payout and closes the Express accounts; the bot can't trade Live.
  const liveAfter = o.liveAfter === undefined ? 4 : o.liveAfter;
  const E = days(evalT);
  const F = days(fundedT);
  const eByDay = new Map<string, number[]>();
  for (const t of evalT) eByDay.set(t.day, [...(eByDay.get(t.day) ?? []), t.pnl]);
  const fByDay = new Map<string, number[]>();
  for (const t of fundedT) fByDay.set(t.day, [...(fByDay.get(t.day) ?? []), t.pnl]);
  const end = o.to ?? [E.at(-1)?.[0] ?? "", F.at(-1)?.[0] ?? ""].sort().at(-1)!;
  const events: SetEvent[] = [];
  const cash: { day: string; fee: number; paid: number }[] = [];
  let start = o.from || E[0]![0];
  let sets = 0;
  while (start <= end) {
    sets++;
    events.push({ day: start, kind: "bought", note: `Set ${sets}: ${accounts} Combines bought` });
    let bal = 0, high = 0, best = 0, at = end;
    let result: "pass" | "fail" | null = null;
    for (const [day, net] of E) {
      if (day < start) continue;
      if (day > end) break;
      const floor = Math.min(high - 2000, 0);
      for (const p of eByDay.get(day)!) {
        bal += p;
        if (bal <= floor) {
          result = "fail";
          break;
        }
      }
      if (result) {
        at = day;
        break;
      }
      best = Math.max(best, net);
      high = Math.max(high, bal);
      if (bal >= 3000 && best <= 0.5 * bal) {
        result = "pass";
        at = day;
        break;
      }
    }
    const months = Math.ceil(calDays(start, at) / 30);
    for (let m = 0; m < months; m++) {
      const d = new Date(Date.parse(`${start}T12:00:00Z`) + m * 30 * 86_400_000).toISOString().slice(0, 10);
      if (d <= end) cash.push({ day: d, fee: accounts * monthly, paid: 0 });
    }
    if (!result) break;
    if (result === "fail") {
      events.push({ day: at, kind: "failed", note: `Set ${sets} failed the Combine (${months} ${months === 1 ? "month" : "months"} of fees)` });
      start = nextWeekday(at);
      continue;
    }
    events.push({ day: at, kind: "passed", note: `Set ${sets} passed after ${months} ${months === 1 ? "month" : "months"}: funded` });
    let fb = 0, fh = 0, wins = 0, locked = false, paidOut = 0;
    let busted: string | null = null;
    let live: string | null = null;
    const fStart = nextWeekday(at);
    for (const [day, net] of F) {
      if (day < fStart) continue;
      if (day > end) break;
      const floor = locked ? 0 : Math.min(fh - 2000, 0);
      for (const p of fByDay.get(day)!) {
        fb += p;
        if (fb <= floor) {
          busted = day;
          break;
        }
      }
      if (busted) break;
      if (net >= 150) wins++;
      fh = Math.max(fh, fb);
      if (fh >= 2000) locked = true; // the max loss stops trailing once it reaches the start balance
      if (wins >= 5 && fb >= 4000) {
        cash.push({ day, fee: 0, paid: accounts * keep });
        events.push({ day, kind: "payout", note: `Payout: ${accounts} × $${keep.toLocaleString("en-US")} = $${(accounts * keep).toLocaleString("en-US")}` });
        fb -= 2000;
        wins = 0;
        if (liveAfter && ++paidOut >= liveAfter) {
          live = day;
          break;
        }
      }
    }
    if (live) {
      events.push({ day: live, kind: "live", note: `Set ${sets}: called up to Live after ${paidOut} payouts, Express accounts closed (the bot can't trade Live), so a new set is bought` });
      start = nextWeekday(live);
      continue;
    }
    if (!busted) break;
    events.push({ day: busted, kind: "busted", note: `Set ${sets} busted` });
    start = nextWeekday(busted);
  }
  const byMonth = new Map<string, { fees: number; paid: number; payouts: number }>();
  for (const c of cash) {
    const m = byMonth.get(c.day.slice(0, 7)) ?? { fees: 0, paid: 0, payouts: 0 };
    m.fees += c.fee;
    m.paid += c.paid;
    if (c.paid) m.payouts++;
    byMonth.set(c.day.slice(0, 7), m);
  }
  let total = 0, lowest = 0;
  const monthsOut = [...byMonth]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => {
      total += m.paid - m.fees;
      lowest = Math.min(lowest, total);
      return { month, fees: m.fees, paid: m.paid, net: m.paid - m.fees, total, payouts: m.payouts };
    });
  const fees = cash.reduce((s, c) => s + c.fee, 0);
  const paid = cash.reduce((s, c) => s + c.paid, 0);
  return { events, months: monthsOut, fees, paid, net: paid - fees, sets, payoutDays: events.filter((e) => e.kind === "payout").length, firstPayout: events.find((e) => e.kind === "payout")?.day ?? null, lowest };
}

/** setsRun started on every weekday of the first year and run for 12 months: what a year of it looks like. */
export function setsYear(evalT: BtTrade[], fundedT: BtTrade[], accounts = 5, liveAfter: number | null = 4) {
  const first = days(evalT)[0]![0];
  const out: { net: number; fees: number; payoutDays: number; sets: number }[] = [];
  const t0 = Date.parse(`${first}T12:00:00Z`);
  for (let t = t0; t <= t0 + 364 * 86_400_000; t += 86_400_000) {
    if ([0, 6].includes(new Date(t).getUTCDay())) continue;
    const from = new Date(t).toISOString().slice(0, 10);
    const to = new Date(t + 365 * 86_400_000).toISOString().slice(0, 10);
    const r = setsRun(evalT, fundedT, { accounts, from, to, liveAfter });
    out.push({ net: r.net, fees: r.fees, payoutDays: r.payoutDays, sets: r.sets });
  }
  const pick = (k: "net" | "fees" | "payoutDays", p: number) => out.map((x) => x[k]).sort((a, b) => a - b)[Math.floor(p * (out.length - 1))]!;
  const avg = (k: "net" | "fees" | "payoutDays" | "sets") => out.reduce((s, x) => s + x[k], 0) / out.length;
  return {
    starts: out.length,
    net: { avg: avg("net"), typical: pick("net", 0.5), low10: pick("net", 0.1), worst: pick("net", 0), best: pick("net", 1) },
    fees: { avg: avg("fees"), typical: pick("fees", 0.5), worst: pick("fees", 1) },
    payoutDays: { avg: avg("payoutDays"), fewest: pick("payoutDays", 0), most: pick("payoutDays", 1) },
    sets: avg("sets"),
    losing: out.filter((x) => x.net < 0).length / out.length,
  };
}

/** Every trade made worse by a fixed amount (slippage, delay): the "realistic" case. */
export const worse = (ts: BtTrade[], by: number): BtTrade[] => ts.map((t) => ({ ...t, pnl: Math.round((t.pnl - by) * 100) / 100 }));
