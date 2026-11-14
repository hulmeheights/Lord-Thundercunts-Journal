/**
 * MNQ Pass Plan: script C plus the SOR SAFE add-on (website spec of 13 Nov 2026).
 * The journal holds each account's stage (eval / funded / pre-live) and works
 * out, per account and per signal: take it or not, the size, the stop and the
 * target. Every number has a tested default per stage and can be changed per
 * card. Pure, so it's unit-tested; the Mac only places and watches the orders.
 */

export type Firm = "topstep" | "lucid";
export type Stage = "eval" | "funded" | "prelive";
export type Script = "A" | "C" | "D";
export type PassSession = "ASIA" | "LON" | "NY";
export type SorSession = "LON" | "NYAM";
export type AnySession = PassSession | SorSession;
export type Strategy = "C" | "SOR";
export type Dir = "LONG" | "SHORT";

export const SESSION_NAME: Record<AnySession, string> = { ASIA: "Asia", LON: "London", NY: "New York", NYAM: "NY AM" };
/** New York time each C session's order goes in, and its time exit. */
export const SESSION_TIMES: Record<PassSession, { signal: string; exit: string }> = {
  ASIA: { signal: "20:01", exit: "02:59" },
  LON: { signal: "03:31", exit: "09:39" },
  NY: { signal: "10:11", exit: "16:09" },
};
/** Every SOR trade is flat by 16:09 New York. */
export const SOR_EXIT = "16:09";
/** SOR's own sessions (New York minutes of the day) and how long into each a first signal still counts. */
export const SOR_SESSIONS: Record<SorSession, { start: number; window: number }> = { LON: { start: 180, window: 150 }, NYAM: { start: 570, window: 90 } };
export const DOLLARS_PER_POINT = 2; // one MNQ
export const TICK = 0.25;
export const COST_PER_CONTRACT = 1; // $ round trip on a C trade, as tested
export const SOR_COST_PER_CONTRACT = 1.24; // $ round trip on a SOR trade, as tested

/**
 * Everything one stage of one account trades by. `defaults()` gives the tested
 * numbers; a card can override any of them (saved per stage, so an account
 * picks up its funded settings the moment it's set to funded).
 */
export type StageCfg = {
  // Script C
  contracts: number; // full size
  stopPts: number; // always this far, in points; short of room = fewer contracts, never a tighter stop
  dayGoal: number; // most a day aims to make
  targetMode: "goal" | "points" | "dollars"; // goal = whatever is left of today's goal
  targetValue: number; // points or dollars, for the two fixed modes
  capAtGoal: boolean; // a fixed target never reaches past what's left of today's goal
  asia: boolean;
  lon: boolean;
  ny: boolean;
  maxTradesDay: number; // C and SOR together
  stopAfterLosses: number; // 0 = off
  dayLossStop: number | null; // your own stop for the day, as a positive $ amount
  sizeDown: boolean; // short of room: trade fewer contracts (off = skip instead)
  minTarget: number; // never aim for less than this, after costs
  guard: boolean; // the Mac closes at market the moment the target price trades, if the target order hasn't
  // The account's rules
  passTarget: number | null; // profit that passes the stage (eval, pre-live)
  consistency: number | null; // best day at most this share of the profit (0.55 = 55%)
  passMargin: number; // aim this much past the pass line, so costs never leave it a few dollars short
  mll: number; // trailing max loss
  dllAmount: number | null; // daily loss limit, if the account has one
  payoutBalance: number | null; // funded: run to this, then the payout
  payoutAmount: number; // what you request
  winDaysNeeded: number;
  winDay: number; // a day counts as winning from this much
  fee: number; // eval price, for the books
  // SOR SAFE add-on
  sorOn: boolean;
  sorContracts: number;
  sorLon: boolean;
  sorNyam: boolean;
  sorCapAtGoal: boolean; // the SOR target never reaches past what's left of today's goal
  sorHalfStop: boolean; // skip when the capped reward is under half the stop (unless it finishes the account)
};

/** The tested defaults (website spec, sections 0b and B5/B6). */
export function defaults(firm: Firm, stage: Stage, withDll = false): StageCfg {
  const base: StageCfg = {
    contracts: 10, stopPts: 50, dayGoal: 1640, targetMode: "goal", targetValue: 82.5, capAtGoal: true,
    asia: true, lon: true, ny: true, maxTradesDay: 5, stopAfterLosses: 0, dayLossStop: null, sizeDown: true, minTarget: 25, guard: true,
    passTarget: 3000, consistency: 0.55, passMargin: 10, mll: 2000, dllAmount: null,
    payoutBalance: null, payoutAmount: 2000, winDaysNeeded: 5, winDay: 150, fee: 120,
    sorOn: false, sorContracts: 5, sorLon: true, sorNyam: true, sorCapAtGoal: true, sorHalfStop: true,
  };
  if (firm === "lucid") {
    if (stage === "eval") return { ...base, dayGoal: 1200, consistency: 0.4, passMargin: 0, fee: 180 };
    return { ...base, stopPts: 62.5, dayGoal: 2000, passTarget: 2000, consistency: null, passMargin: 0, fee: 180 };
  }
  const dllAmount = withDll ? 1000 : null;
  if (stage === "eval") return { ...base, dllAmount, sorOn: true };
  // Topstep funded: 7 MNQ ($700 risk), $1,000 day goal, payout at $4,000 ($8,000 with the daily loss limit).
  return { ...base, contracts: 7, dayGoal: 1000, targetValue: 71.5, passTarget: null, consistency: null, passMargin: 0, dllAmount, payoutBalance: withDll ? 8000 : 4000, payoutAmount: withDll ? 4000 : 2000 };
}

const NUM: Record<string, [number, number]> = {
  contracts: [1, 50], stopPts: [1, 500], dayGoal: [25, 100_000], targetValue: [0.25, 100_000], maxTradesDay: [1, 10], stopAfterLosses: [0, 10], minTarget: [0, 1000],
  passMargin: [0, 1000], mll: [100, 100_000], payoutAmount: [0, 100_000], winDaysNeeded: [0, 60], winDay: [0, 10_000], fee: [0, 10_000], sorContracts: [1, 20],
  passTarget: [100, 100_000], consistency: [0.05, 1], dllAmount: [50, 100_000], payoutBalance: [100, 200_000], dayLossStop: [25, 100_000],
};
const INT = new Set(["contracts", "maxTradesDay", "stopAfterLosses", "winDaysNeeded", "sorContracts"]);
const NULLABLE = new Set(["passTarget", "consistency", "dllAmount", "payoutBalance", "dayLossStop"]);
const BOOL = new Set(["capAtGoal", "asia", "lon", "ny", "sizeDown", "guard", "sorOn", "sorLon", "sorNyam", "sorCapAtGoal", "sorHalfStop"]);

/** Only what's a real, in-range setting survives; anything else falls back to the default. */
export function cleanOverrides(raw: unknown): Partial<StageCfg> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (BOOL.has(k) && typeof v === "boolean") out[k] = v;
    else if (k === "targetMode" && (v === "goal" || v === "points" || v === "dollars")) out[k] = v;
    else if (k in NUM) {
      if (v === null && NULLABLE.has(k)) out[k] = null;
      else if (typeof v === "number" && Number.isFinite(v) && v >= NUM[k]![0] && v <= NUM[k]![1]) out[k] = INT.has(k) ? Math.round(v) : k === "stopPts" ? Math.max(TICK, Math.round(v / TICK) * TICK) : v;
    }
  }
  return out as Partial<StageCfg>;
}

export type SavedSettings = Partial<Record<Stage, Partial<StageCfg>>>;
/** A card's settings for a stage: the tested defaults, with whatever the card changed on top. */
export function resolve(firm: Firm, stage: Stage, withDll: boolean, saved?: SavedSettings | null): StageCfg {
  return { ...defaults(firm, stage, withDll), ...cleanOverrides(saved?.[stage]) };
}
export const fullRisk = (c: StageCfg) => c.contracts * c.stopPts * DOLLARS_PER_POINT;

export type DayPnl = { day: string; pnl: number };
export type Baseline = { profit: number; best: number; winDays: number };
export type Stats = {
  profit: number; // all of it, today included
  before: number; // up to the end of yesterday
  today: number;
  best: number; // best day so far (today included)
  bestBefore: number;
  winDays: number; // winning days (today included)
  winDaysBefore: number;
  maxEod: number; // highest end-of-day profit (for the trailing loss limit)
  floor: number; // the loss limit, as profit
  todayTrades: number;
  todayLosses: number;
};

/**
 * Where an account stands, from its closed trades (one row each) by trading
 * day, plus what it had made before the bot. After a payout the loss floor is
 * fixed at $0 for good (`floorLocked`).
 */
export function accountStats(rows: DayPnl[], today: string, base: Baseline = { profit: 0, best: 0, winDays: 0 }, cfg?: Pick<StageCfg, "mll" | "winDay">, floorLocked = false): Stats {
  const byDay = new Map<string, number>();
  for (const d of rows) byDay.set(d.day, (byDay.get(d.day) ?? 0) + d.pnl);
  const winDay = cfg?.winDay ?? 150;
  let before = base.profit;
  let bestBefore = base.best;
  let winDaysBefore = base.winDays;
  let maxEod = Math.max(0, base.profit);
  for (const [day, pnl] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
    if (day >= today) continue;
    before += pnl;
    bestBefore = Math.max(bestBefore, pnl);
    if (pnl >= winDay) winDaysBefore++;
    maxEod = Math.max(maxEod, before);
  }
  const t = byDay.get(today) ?? 0;
  const mine = rows.filter((d) => d.day === today);
  return {
    profit: before + t,
    before,
    today: t,
    best: Math.max(bestBefore, t),
    bestBefore,
    winDays: winDaysBefore + (t >= winDay ? 1 : 0),
    winDaysBefore,
    maxEod,
    // The loss limit trails the best end-of-day profit and stops at the starting balance.
    floor: floorLocked ? 0 : Math.min(maxEod - (cfg?.mll ?? 2000), 0),
    todayTrades: mine.length,
    todayLosses: mine.filter((d) => d.pnl < 0).length,
  };
}

export const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-GB")}`;
const ceilTick = (pts: number) => Math.ceil(pts / TICK - 1e-9) * TICK;

/** What the account can still lose: down to the loss floor, or to the daily loss limit if it has one. */
export const roomOf = (c: StageCfg, s: Stats) => Math.min(s.profit - s.floor, c.dllAmount !== null ? c.dllAmount + s.today : Infinity);

export type Done = { kind: "passed" | "payout" | "blown"; text: string } | null;

/** After every close: passed, payout ready, or blown. */
export function accountDone(stage: Stage, c: StageCfg, s: Stats): Done {
  if (s.profit <= s.floor) return { kind: "blown", text: `hit the loss limit (${money(s.profit)} against a limit of ${money(s.floor)})` };
  // Less room above the limit than 1 contract at the full stop: it can never trade again, so it's done.
  const one = c.stopPts * DOLLARS_PER_POINT;
  if (s.profit - s.floor < one) return { kind: "blown", text: `only ${money(s.profit - s.floor)} above the loss limit: less than 1 contract's stop (${money(one)}), so it can't trade again` };
  if (stage === "funded" && c.payoutBalance !== null && s.winDays >= c.winDaysNeeded && s.profit >= c.payoutBalance) {
    return { kind: "payout", text: `payout ready: ${s.winDays} winning days and ${money(s.profit)} profit. Request ${money(c.payoutAmount)}, then press "Payout taken" on the card to carry on` };
  }
  if (c.passTarget !== null && s.profit >= c.passTarget && (c.consistency === null || s.best <= c.consistency * s.profit + 0.005)) {
    return { kind: "passed", text: `passed: ${money(s.profit)} profit, best day ${money(s.best)}` };
  }
  return null;
}

/** What the stage still needs, from yesterday's close: to the pass line (and inside the consistency rule), or to the payout balance. */
function needed(stage: Stage, c: StageCfg, s: Stats): number {
  if (stage === "funded") return c.payoutBalance !== null && s.winDaysBefore >= c.winDaysNeeded ? c.payoutBalance - s.before : Infinity;
  if (c.passTarget === null) return Infinity;
  return Math.max(c.passTarget - s.before, c.consistency ? s.bestBefore / c.consistency - s.before : 0) + c.passMargin;
}
/** Today's goal for the account (spec B5, step 1), before what today has made. */
export const dayGoal = (stage: Stage, c: StageCfg, s: Stats) => Math.min(c.dayGoal, needed(stage, c, s));
/** True when today's goal is the last bit the account needs (to pass, or to the payout), not just the day cap. */
export const finishing = (stage: Stage, c: StageCfg, s: Stats) => needed(stage, c, s) <= c.dayGoal;

export type Signal = {
  session: PassSession;
  tradingDay: string; // YYYY-MM-DD, the trading day (18:00 New York starts the next)
  dir: Dir;
  price: number; // the signal bar's close
  bias: "UP" | "DOWN" | null; // the session's finished 4H candle body
  vah: number | null;
  val: number | null;
};
export type Card = { firm: Firm; stage: Stage; cfg: StageCfg };
export type Plan =
  | { take: false; reason: string }
  | { take: true; reason: string; risk: number; goalLeft: number; qty: number; stopPts: number; targetPts: number; stopTicks: number; targetTicks: number; capped?: boolean };

/** The checks C and SOR share: is the account still trading today, and how much is left to make and to lose. */
function gate(card: Card, s: Stats): { stop: string } | { left: number; last: boolean; room: number; goal: number } {
  const c = card.cfg;
  const done = accountDone(card.stage, c, s);
  if (done) return { stop: done.text };
  const goal = dayGoal(card.stage, c, s);
  const left = goal - s.today;
  const last = finishing(card.stage, c, s);
  // Under the minimum left of a day cap: the day is done. The last few dollars to a pass or payout are still worth one more trade.
  if (left <= 0 || (left < c.minTarget && !last)) return { stop: `today's goal reached (${money(s.today)} of ${money(goal)})` };
  if (s.todayTrades >= c.maxTradesDay) return { stop: `${c.maxTradesDay} ${c.maxTradesDay === 1 ? "trade" : "trades"} today already (your limit)` };
  if (c.stopAfterLosses > 0 && s.todayLosses >= c.stopAfterLosses) return { stop: `${s.todayLosses} losing ${s.todayLosses === 1 ? "trade" : "trades"} today (your stop for the day)` };
  if (c.dayLossStop !== null && s.today <= -c.dayLossStop) return { stop: `down ${money(-s.today)} today (your stop for the day is ${money(c.dayLossStop)})` };
  if (c.dllAmount !== null && s.today <= -c.dllAmount) return { stop: `daily loss limit hit (${money(s.today)})` };
  const room = roomOf(c, s);
  if (room < 25) return { stop: `less than $25 of room left (${money(room)})` };
  return { left, last, room, goal };
}

/** One account, one C signal: take it or not, and the size, stop and target. */
export function plan(card: Card, s: Stats, sig: Signal): Plan {
  const c = card.cfg;
  const wd = new Date(`${sig.tradingDay}T12:00:00Z`).getUTCDay();
  if (wd === 0 || wd === 6) return { take: false, reason: "no trading day (weekend)" };
  const g = gate(card, s);
  if ("stop" in g) return { take: false, reason: g.stop };
  if (!{ ASIA: c.asia, LON: c.lon, NY: c.ny }[sig.session]) return { take: false, reason: `${SESSION_NAME[sig.session]} is switched off for this stage` };

  // Always the full stop. When a loss limit has less room than the full risk: the same stop on fewer contracts.
  const stopPts = c.stopPts;
  const perContract = stopPts * DOLLARS_PER_POINT;
  const qty = g.room >= c.contracts * perContract ? c.contracts : c.sizeDown ? Math.min(c.contracts, Math.floor(g.room / perContract + 1e-9)) : 0;
  if (qty < 1) {
    return { take: false, reason: c.sizeDown ? `only ${money(g.room)} of room: not enough for 1 contract at the ${stopPts}-point stop` : `only ${money(g.room)} of room: under the full ${money(c.contracts * perContract)} risk, and sizing down is off` };
  }
  // The target covers the costs too, so hitting it really adds what's left (at least the minimum when it finishes the account).
  const aim = (g.last ? Math.max(g.left, c.minTarget) : g.left) + qty * COST_PER_CONTRACT;
  const goalPts = Math.max(TICK, ceilTick(aim / (qty * DOLLARS_PER_POINT)));
  let targetPts = goalPts;
  let capped = false;
  if (c.targetMode !== "goal") {
    const fixed = c.targetMode === "points" ? Math.max(TICK, ceilTick(c.targetValue)) : Math.max(TICK, ceilTick((c.targetValue + qty * COST_PER_CONTRACT) / (qty * DOLLARS_PER_POINT)));
    capped = c.capAtGoal && fixed > goalPts;
    targetPts = capped ? goalPts : fixed;
  }
  const risk = qty * perContract;
  const what = c.targetMode === "goal" ? `left of today's ${money(g.goal)}` : capped ? `your target, cut to what's left of today's ${money(g.goal)}` : "your fixed target";
  return {
    take: true,
    reason: `${qty} MNQ${qty < c.contracts ? ` (cut from ${c.contracts}: ${money(g.room)} of room)` : ""} · stop ${stopPts} pt (${money(risk)}) · target ${targetPts} pt (${money(targetPts * qty * DOLLARS_PER_POINT)}: ${what})`,
    qty,
    risk,
    goalLeft: g.left,
    stopPts,
    targetPts,
    stopTicks: Math.round(stopPts / TICK),
    targetTicks: Math.round(targetPts / TICK),
    capped,
  };
}

export type SorSig = { session: SorSession; dir: Dir; entry: number; stop: number; target: number };
export type SorPlan =
  | { take: false; reason: string }
  | { take: true; reason: string; qty: number; risk: number; goalLeft: number; stop: number; targetPts: number; stopTicks: number; targetTicks: number; capped: boolean };

/**
 * One account, the session's SOR SAFE trade (spec 4.3 to 4.5): SOR's own stop
 * PRICE, its target capped at what's left of today's goal, fewer contracts when
 * room is short, and never a moved stop. Whether the signal is the session's
 * first valid, safe one is decided once for every account, before this.
 */
export function planSor(card: Card, s: Stats, sig: SorSig): SorPlan {
  const c = card.cfg;
  if (!c.sorOn) return { take: false, reason: "SOR add-on is off for this stage" };
  if (!(sig.session === "LON" ? c.sorLon : c.sorNyam)) return { take: false, reason: `SOR ${SESSION_NAME[sig.session]} is switched off for this stage` };
  const sign = sig.dir === "LONG" ? 1 : -1;
  const stopDist = (sig.entry - sig.stop) * sign;
  const tgtDist = (sig.target - sig.entry) * sign;
  if (!(stopDist >= TICK) || !(tgtDist >= TICK)) return { take: false, reason: "the stop and target aren't on the right sides of the entry" };
  const g = gate(card, s);
  if ("stop" in g) return { take: false, reason: g.stop };
  // Loss at the stop, one contract: the distance plus a tick of slip, plus costs.
  const perC = (stopDist + TICK) * DOLLARS_PER_POINT + SOR_COST_PER_CONTRACT;
  const qty = g.room >= perC * c.sorContracts ? c.sorContracts : Math.min(c.sorContracts, Math.floor(g.room / perC + 1e-9));
  if (qty < 1) return { take: false, reason: `only ${money(g.room)} of room: not enough for 1 contract at SOR's ${stopDist}-point stop` };
  let targetPts = tgtDist;
  let capped = false;
  if (c.sorCapAtGoal) {
    const capPts = ceilTick((g.left + SOR_COST_PER_CONTRACT * qty) / (DOLLARS_PER_POINT * qty));
    if (tgtDist > capPts) {
      if (c.sorHalfStop && capPts < 0.5 * stopDist && !g.last) return { take: false, reason: `only ${money(g.left)} left of today's goal: under half of SOR's stop, not worth the trade` };
      targetPts = capPts;
      capped = true;
    }
  }
  const risk = Math.round(perC * qty * 100) / 100;
  return {
    take: true,
    reason: `SOR · ${qty} MNQ${qty < c.sorContracts ? ` (cut from ${c.sorContracts}: ${money(g.room)} of room)` : ""} · stop ${sig.stop} (${money(risk)}) · target ${targetPts} pt${capped ? ` (capped at what's left of today's ${money(g.goal)})` : ""}`,
    qty,
    risk,
    goalLeft: g.left,
    stop: sig.stop,
    targetPts,
    stopTicks: Math.round(stopDist / TICK),
    targetTicks: Math.round(targetPts / TICK),
    capped,
  };
}

export type RawSor = { swing: string; session: string; dow: string; mins_in: number; quiet: boolean; target: number | null; quiet_target: number | null; strategy?: string | null };
/** Spec 4.1: is this SOR signal one that can count as a session's first? Returns the target to use, or why not. */
export function sorValid(sig: RawSor): { ok: true; session: SorSession; target: number } | { ok: false; reason: string } {
  if (sig.strategy) return { ok: false, reason: `${sig.strategy} signal: not SOR` };
  if (sig.swing !== "3/3") return { ok: false, reason: `swing ${sig.swing}: only 3/3 is traded` };
  if (sig.session !== "LON" && sig.session !== "NYAM") return { ok: false, reason: `${sig.session}: SOR only trades London and NY AM` };
  if (sig.dow === "Thu") return { ok: false, reason: "Thursday: no SOR" };
  if (!(sig.mins_in < SOR_SESSIONS[sig.session].window)) return { ok: false, reason: `${sig.mins_in} min into ${sig.session}: past the first ${SOR_SESSIONS[sig.session].window}` };
  const target = sig.quiet ? sig.quiet_target : sig.target;
  if (target === null || target === undefined) return { ok: false, reason: "no usable target" };
  return { ok: true, session: sig.session, target };
}

/** The trading day a moment belongs to: 18:00 New York starts the next one. */
export function passTradingDay(at: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  const d = new Date(`${g("year")}-${g("month")}-${g("day")}T12:00:00Z`);
  if (Number(g("hour")) >= 18) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
