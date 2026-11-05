/**
 * Scale: your own trading, copied across many accounts. Measures your edge in
 * R from the journal (optionally only your window and only A+ trades), checks
 * whether it's ready to scale, and simulates a year of copying it onto funded
 * accounts with the same max loss, payouts and replacements a prop firm has.
 * Pure (seeded randomness), so it's unit-tested.
 */
import type { Trade } from "../types";
import { accountRisks, rMultiple, type RiskBasis } from "./stats";
import { dayKey, minuteOfDay } from "./time";

export type ScaleFilter = { window: { start: number; end: number } | null; grades: string[] | null };

export type Edge = {
  n: number;
  winRate: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  pf: number | null;
  expectancyR: number | null;
  tradesPerDay: number | null;
  daysPerMonth: number;
  worstStreak: number;
  rs: number[];
  perDay: number[];
  ready: { ok: boolean; checks: { label: string; ok: boolean; value: string }[] };
};

/** Your trades in R (each account's own 1R), filtered to the window and grades asked for. */
export function measureEdge(trades: Trade[], basis: RiskBasis, tz: string, f: ScaleFilter): Edge {
  const risks = accountRisks(trades, basis);
  const defaultRisk = basis && typeof basis === "object" ? basis.defaultRisk : basis;
  const keep = trades
    .filter((t) => !f.window || ((m) => m >= f.window!.start && m < f.window!.end)(minuteOfDay(t.entryTime, tz)))
    .filter((t) => !f.grades || (t.grade != null && f.grades.includes(t.grade)))
    .sort((a, b) => a.entryTime.localeCompare(b.entryTime));
  const rows = keep.map((t) => ({ t, r: rMultiple(t, defaultRisk, risks.get(t.accountId ?? t.source) ?? null) })).filter((x): x is { t: Trade; r: number } => x.r !== null && Number.isFinite(x.r));
  const rs = rows.map((x) => Math.max(-3, Math.min(10, x.r))); // a fat-finger outlier can't run the whole projection
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r < 0);
  const gw = wins.reduce((s, r) => s + r, 0);
  const gl = -losses.reduce((s, r) => s + r, 0);
  const days = new Map<string, number>();
  for (const x of rows) days.set(dayKey(x.t.entryTime, tz), (days.get(dayKey(x.t.entryTime, tz)) ?? 0) + 1);
  const first = rows[0]?.t.entryTime;
  const last = rows.at(-1)?.t.entryTime;
  const weeks = first && last ? Math.max(1, (Date.parse(last) - Date.parse(first)) / (7 * 86_400_000)) : 1;
  const daysPerMonth = Math.min(21, Math.max(4, Math.round((days.size / weeks) * 4.33)));
  let streak = 0, worst = 0;
  for (const r of rs) {
    streak = r < 0 ? streak + 1 : 0;
    worst = Math.max(worst, streak);
  }
  const n = rs.length;
  const pf = gl > 0 ? gw / gl : wins.length ? Infinity : null;
  const exp = n ? rs.reduce((s, r) => s + r, 0) / n : null;
  const checks = [
    { label: "At least 40 trades", ok: n >= 40, value: `${n}` },
    { label: "Profit factor 1.3 or more", ok: pf !== null && pf >= 1.3, value: pf === null ? "—" : Number.isFinite(pf) ? pf.toFixed(2) : "∞" },
    { label: "Makes money per trade", ok: exp !== null && exp > 0, value: exp === null ? "—" : `${exp >= 0 ? "+" : ""}${exp.toFixed(2)}R` },
  ];
  return {
    n,
    winRate: n ? wins.length / n : null,
    avgWinR: wins.length ? gw / wins.length : null,
    avgLossR: losses.length ? -gl / losses.length : null,
    pf,
    expectancyR: exp,
    tradesPerDay: days.size ? n / days.size : null,
    daysPerMonth,
    worstStreak: worst,
    rs,
    perDay: [...days.values()],
    ready: { ok: checks.every((c) => c.ok), checks },
  };
}

/** Small seeded generator (mulberry32): the same inputs always give the same projection. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ScaleOpts = { risk: number; months?: number; sims?: number; mll?: number; payoutAt?: number; payoutTake?: number; keep?: number; replaceCost?: number; downtimeDays?: number; seed?: number };
export type AccountYear = { median: number; low10: number; high90: number; bustChance: number; avgBusts: number; avgPayouts: number };

/**
 * One funded account trading your edge for a year, many times over: each day
 * takes a day's worth of your trades (sampled from your own days), each trade
 * one of your own R results × the risk you set. Max loss trails the highest
 * end-of-day balance and stops at the start once it's $2,000 up; a payout of
 * $2,000 (90% to you) whenever it's $4,000 up; a bust costs a replacement eval
 * and some days off before trading again. Copied accounts all do the same, so
 * N accounts = N × one account.
 */
export function simulateAccountYear(edge: Edge, o: ScaleOpts): AccountYear | null {
  if (edge.rs.length < 10 || !edge.perDay.length) return null;
  const months = o.months ?? 12, sims = o.sims ?? 2000, mll = o.mll ?? 2000, payoutAt = o.payoutAt ?? 4000, take = o.payoutTake ?? 2000, keep = o.keep ?? 0.9;
  const cost = o.replaceCost ?? 150, downtime = o.downtimeDays ?? 20;
  const rand = rng(o.seed ?? 7);
  const days = months * edge.daysPerMonth;
  const nets: number[] = [];
  let bustRuns = 0, busts = 0, payouts = 0;
  for (let s = 0; s < sims; s++) {
    let bal = 0, high = 0, locked = false, wait = 0, paid = 0, spent = 0, b = 0;
    for (let d = 0; d < days; d++) {
      if (wait > 0) {
        wait--;
        continue;
      }
      const floor = locked ? 0 : Math.min(high - mll, 0);
      const count = edge.perDay[Math.floor(rand() * edge.perDay.length)]!;
      let bust = false;
      for (let k = 0; k < count; k++) {
        bal += edge.rs[Math.floor(rand() * edge.rs.length)]! * o.risk;
        if (bal <= floor) {
          bust = true;
          break;
        }
      }
      if (bust) {
        b++;
        spent += cost;
        bal = 0;
        high = 0;
        locked = false;
        wait = downtime;
        continue;
      }
      high = Math.max(high, bal);
      if (high >= mll) locked = true;
      if (bal >= payoutAt) {
        paid += take * keep;
        bal -= take;
        payouts++;
      }
    }
    nets.push(paid - spent);
    if (b) bustRuns++;
    busts += b;
  }
  nets.sort((a, b) => a - b);
  const pct = (p: number) => Math.round(nets[Math.floor(p * (nets.length - 1))]!);
  return { median: pct(0.5), low10: pct(0.1), high90: pct(0.9), bustChance: bustRuns / sims, avgBusts: busts / sims, avgPayouts: payouts / sims };
}
