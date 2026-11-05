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
  /** Trades that were copies of another account's trade, folded into it. */
  copiesFolded: number;
  /** Trades left out because no 1R could be worked out for them. */
  noRisk: number;
  funnel: { period: number; inWindow: number | null; gradedAny: number; aplusAnyTime: number; aplusOutsideWindow: number | null; matching: number };
  rs: number[];
  /** The measured trades themselves (copies folded), for the breakdowns. */
  trades: { at: string; usd: number; r: number }[];
  /** Each trade's real net P&L in dollars (copies averaged). */
  usd: number[];
  netUsd: number;
  avgWinUsd: number | null;
  avgLossUsd: number | null;
  perDay: number[];
  ready: { ok: boolean; checks: { label: string; ok: boolean; value: string }[] };
};

/** Your trades in R (each account's own 1R), filtered to the window and grades asked for. */
export function measureEdge(trades: Trade[], basis: RiskBasis, tz: string, f: ScaleFilter): Edge {
  const risks = accountRisks(trades, basis);
  const defaultRisk = basis && typeof basis === "object" ? basis.defaultRisk : basis;
  const inWin = (t: Trade) => !f.window || ((m) => m >= f.window!.start && m < f.window!.end)(minuteOfDay(t.entryTime, tz));
  const graded = (t: Trade) => !f.grades || (t.grade != null && f.grades.includes(t.grade));
  const keep = trades.filter(inWin).filter(graded).sort((a, b) => a.entryTime.localeCompare(b.entryTime));
  // How the count got from "every trade" to what's measured, so it's never a mystery.
  const funnel = {
    period: trades.length,
    inWindow: f.window ? trades.filter(inWin).length : null,
    gradedAny: trades.filter((t) => t.grade != null).length,
    aplusAnyTime: trades.filter((t) => t.grade === "A+").length,
    aplusOutsideWindow: f.window ? trades.filter((t) => t.grade === "A+" && !inWin(t)).length : null,
    matching: keep.length,
  };
  // An account with too few losses to know its usual 1R borrows the typical 1R of your other accounts,
  // so its winners still count (otherwise only its losses would, which skews everything).
  const known = [...risks.values()].sort((a, b) => a - b);
  const fallback = known.length ? known[Math.floor((known.length - 1) / 2)]! : null;
  const each = keep.map((t) => ({ t, r: rMultiple(t, defaultRisk, risks.get(t.accountId ?? t.source) ?? fallback) })).filter((x): x is { t: Trade; r: number } => x.r !== null && Number.isFinite(x.r));
  // One decision copied to several accounts (Tradecopia, group trading) is one trade, not five: same market and
  // side, entered within a minute on different accounts, counts once at its average R.
  const rows: { t: Trade; r: number; usd: number; copies: number }[] = [];
  for (const x of each) {
    const at = Date.parse(x.t.entryTime);
    const twin = rows.find((y) => y.t.root === x.t.root && y.t.direction === x.t.direction && Math.abs(Date.parse(y.t.entryTime) - at) <= 60_000 && (y.t.accountId ?? y.t.source) !== (x.t.accountId ?? x.t.source));
    if (twin) {
      twin.r = (twin.r * twin.copies + x.r) / (twin.copies + 1);
      twin.usd = (twin.usd * twin.copies + x.t.netPnl) / (twin.copies + 1);
      twin.copies++;
    } else rows.push({ ...x, usd: x.t.netPnl, copies: 1 });
  }
  // Real R, big losses included (only absurd values from a mistyped risk are reined in), so $X risk matches your actual results.
  const rs = rows.map((x) => Math.max(-20, Math.min(40, x.r)));
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
  // Profit factor and averages in dollars: your real results, exactly as the journal has them.
  const usd = rows.map((x) => x.usd);
  const uw = usd.filter((v) => v > 0).reduce((s, v) => s + v, 0);
  const ul = -usd.filter((v) => v < 0).reduce((s, v) => s + v, 0);
  const pf = ul > 0 ? uw / ul : uw > 0 ? Infinity : null;
  const exp = n ? rs.reduce((s, r) => s + r, 0) / n : null;
  const checks = [
    { label: "At least 40 trades", ok: n >= 40, value: `${n}` },
    { label: "Profit factor 1.3 or more", ok: pf !== null && pf >= 1.3, value: pf === null ? "—" : Number.isFinite(pf) ? pf.toFixed(2) : "∞" },
    { label: "Makes money per trade", ok: n > 0 && uw - ul > 0, value: n ? `${uw - ul >= 0 ? "+" : "−"}$${Math.abs((uw - ul) / n).toFixed(0)} a trade` : "—" },
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
    copiesFolded: each.length - rows.length,
    noRisk: keep.length - each.length,
    funnel,
    rs,
    usd,
    netUsd: Math.round((uw - ul) * 100) / 100,
    avgWinUsd: usd.some((v) => v > 0) ? uw / usd.filter((v) => v > 0).length : null,
    avgLossUsd: usd.some((v) => v < 0) ? -ul / usd.filter((v) => v < 0).length : null,
    perDay: [...days.values()],
    trades: rows.map((x) => ({ at: x.t.entryTime, usd: x.usd, r: x.r })),
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

/** risk: dollars per 1R, or "actual" to replay your trades at the size you really traded. */
export type ScaleOpts = { risk: number | "actual"; months?: number; sims?: number; mll?: number; payoutAt?: number; payoutTake?: number; keep?: number; replaceCost?: number; downtimeDays?: number; seed?: number };
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
        const i = Math.floor(rand() * edge.rs.length);
        bal += o.risk === "actual" ? edge.usd[i]! : edge.rs[i]! * o.risk;
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

// ── Breakdowns: when and how your trading makes its money ───────────────────

export type Row = { key: string; n: number; winRate: number | null; net: number; pf: number | null; avg: number | null };
const tallyRows = (key: string, xs: number[]): Row => {
  const w = xs.filter((v) => v > 0).reduce((s, v) => s + v, 0);
  const l = -xs.filter((v) => v < 0).reduce((s, v) => s + v, 0);
  return { key, n: xs.length, winRate: xs.length ? xs.filter((v) => v > 0).length / xs.length : null, net: Math.round((w - l) * 100) / 100, pf: l > 0 ? w / l : w > 0 ? Infinity : null, avg: xs.length ? (w - l) / xs.length : null };
};
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** By entry time (15-minute slots), weekday, which trade of the day, how many trades the day had, and the best and worst days. */
export function edgeBreakdowns(edge: Edge, tz: string, slot = 15) {
  const byTime = new Map<number, number[]>();
  const byWd = new Map<number, number[]>();
  const byNth = new Map<number, number[]>();
  const byDay = new Map<string, number[]>();
  const sorted = [...edge.trades].sort((a, b) => a.at.localeCompare(b.at));
  for (const t of sorted) {
    const m = minuteOfDay(t.at, tz);
    const s = Math.floor(m / slot) * slot;
    byTime.set(s, [...(byTime.get(s) ?? []), t.usd]);
    const d = dayKey(t.at, tz);
    const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
    byWd.set(wd, [...(byWd.get(wd) ?? []), t.usd]);
    const today = byDay.get(d) ?? [];
    const nth = Math.min(today.length + 1, 3);
    byNth.set(nth, [...(byNth.get(nth) ?? []), t.usd]);
    byDay.set(d, [...today, t.usd]);
  }
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const counts = new Map<number, number[]>();
  for (const xs of byDay.values()) {
    const c = Math.min(xs.length, 4);
    counts.set(c, [...(counts.get(c) ?? []), xs.reduce((s, v) => s + v, 0)]);
  }
  const days = [...byDay].map(([day, xs]) => ({ day, n: xs.length, net: Math.round(xs.reduce((s, v) => s + v, 0) * 100) / 100 }));
  return {
    byTime: [...byTime].sort(([a], [b]) => a - b).map(([m, xs]) => tallyRows(`${hhmm(m)}–${hhmm(m + slot)}`, xs)),
    byWeekday: [...byWd].sort(([a], [b]) => a - b).map(([d, xs]) => tallyRows(WD[d]!, xs)),
    byTradeOfDay: [...byNth].sort(([a], [b]) => a - b).map(([k, xs]) => tallyRows(k === 1 ? "1st trade of the day" : k === 2 ? "2nd trade" : "3rd trade or later", xs)),
    // Per day: how days with 1, 2, 3 or 4+ trades turned out (win rate here = green days).
    byDayCount: [...counts].sort(([a], [b]) => a - b).map(([k, xs]) => tallyRows(k >= 4 ? "4+ trades that day" : `${k} trade${k === 1 ? "" : "s"} that day`, xs)),
    bestDays: [...days].sort((a, b) => b.net - a.net).slice(0, 5),
    worstDays: [...days].sort((a, b) => a.net - b.net).slice(0, 5),
    greenDays: days.length ? days.filter((d) => d.net > 0).length / days.length : null,
    tradingDays: days.length,
  };
}
