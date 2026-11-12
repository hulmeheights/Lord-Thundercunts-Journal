/**
 * MNQ Pass Plan (scripts C and D, rules pack of 11 Nov 2026). The bot holds
 * each account's stage (eval / funded / pre-live) and works out, per account
 * and per session: take it or not, the stop and the target. Pure, so it's
 * unit-tested; the Mac only measures the market and places the orders.
 */

export type Firm = "topstep" | "lucid";
export type Stage = "eval" | "funded" | "prelive";
export type Script = "C" | "D";
export type PassSession = "ASIA" | "LON" | "NY";
export type Dir = "LONG" | "SHORT";

export const SESSION_NAME: Record<PassSession, string> = { ASIA: "Asia", LON: "London", NY: "New York" };
/** New York time each session's order goes in, and its time exit. */
export const SESSION_TIMES: Record<PassSession, { signal: string; exit: string }> = {
  ASIA: { signal: "20:01", exit: "02:59" },
  LON: { signal: "03:31", exit: "09:39" },
  NY: { signal: "10:11", exit: "16:09" },
};
export const DOLLARS_PER_POINT = 2; // one MNQ
export const TICK = 0.25;

export type StageRules = {
  risk: number; // $ per trade (hard stop)
  cap: number; // most a day can make
  target: number | null; // profit to pass (eval / pre-live)
  consistency: number | null; // best day must be at most this share of total profit
  dll: number | null; // daily loss limit
  mll: number; // end-of-day trailing loss limit
  payout: { profit: number; winDays: number; winDay: number } | null; // funded: payout ready
  fee: number; // eval price, for the books
};

/** Section 5. Topstep: eval and funded. Lucid (LucidMaxx): step 1 (eval) and pre-live. */
export function stageRules(firm: Firm, stage: Stage, withDll = true): StageRules {
  if (firm === "lucid") {
    if (stage === "eval") return { risk: 1000, cap: 1200, target: 3000, consistency: 0.4, dll: null, mll: 2000, payout: null, fee: 180 };
    return { risk: 1250, cap: 2000, target: 2000, consistency: null, dll: null, mll: 2000, payout: null, fee: 180 };
  }
  if (stage === "eval") return { risk: 1000, cap: 1640, target: 3000, consistency: 0.55, dll: withDll ? 1000 : null, mll: 2000, payout: null, fee: 120 };
  return withDll
    ? { risk: 750, cap: 2500, target: null, consistency: null, dll: 1000, mll: 2000, payout: { profit: 8000, winDays: 5, winDay: 150 }, fee: 120 }
    : { risk: 750, cap: 1640, target: null, consistency: null, dll: null, mll: 2000, payout: { profit: 4000, winDays: 5, winDay: 150 }, fee: 120 };
}

/** Script C filters in every stage; script D only once the account is funded / pre-live. */
export const filtersApply = (script: Script, stage: Stage) => script === "C" || stage !== "eval";

export type DayPnl = { day: string; pnl: number };
export type Baseline = { profit: number; best: number; winDays: number };
export type Stats = {
  profit: number; // all of it, today included
  before: number; // up to the end of yesterday
  today: number;
  best: number; // best day so far (today included)
  bestBefore: number;
  winDays: number; // days of $150+ (today included)
  winDaysBefore: number;
  maxEod: number; // highest end-of-day profit (for the trailing loss limit)
  floor: number; // the trailing loss limit, as profit
};

/**
 * Where an account stands, from its closed trades by trading day (and what it
 * had made before the bot, if you started a card part-way).
 */
export function accountStats(days: DayPnl[], today: string, base: Baseline = { profit: 0, best: 0, winDays: 0 }, rules?: Pick<StageRules, "mll" | "payout">): Stats {
  const byDay = new Map<string, number>();
  for (const d of days) byDay.set(d.day, (byDay.get(d.day) ?? 0) + d.pnl);
  const winDay = rules?.payout?.winDay ?? 150;
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
  const mll = rules?.mll ?? 2000;
  return {
    profit: before + t,
    before,
    today: t,
    best: Math.max(bestBefore, t),
    bestBefore,
    winDays: winDaysBefore + (t >= winDay ? 1 : 0),
    winDaysBefore,
    maxEod,
    // The loss limit trails the best end-of-day balance and stops at the starting balance.
    floor: Math.min(maxEod - mll, 0),
  };
}

export type Done = { kind: "passed" | "payout" | "blown"; text: string } | null;

/** After every close: passed, payout ready, or blown. */
export function accountDone(stage: Stage, r: StageRules, s: Stats): Done {
  if (s.profit <= s.floor) return { kind: "blown", text: `hit the trailing loss limit (${money(s.profit)} against a limit of ${money(s.floor)})` };
  if (stage === "funded" && r.payout && s.winDays >= r.payout.winDays && s.profit >= r.payout.profit) {
    return { kind: "payout", text: `payout ready: ${s.winDays} winning days and ${money(s.profit)} profit. Request the payout and stop trading this account` };
  }
  if (r.target !== null && s.profit >= r.target && (r.consistency === null || s.best <= r.consistency * s.profit + 0.005)) {
    return { kind: "passed", text: `passed: ${money(s.profit)} profit, best day ${money(s.best)}` };
  }
  return null;
}

/** True when today's goal is the last bit the account needs (to pass, or to the payout), not just the day cap. */
export function finishing(stage: Stage, r: StageRules, s: Stats): boolean {
  if (stage === "funded") return !!r.payout && s.winDaysBefore >= r.payout.winDays && r.payout.profit - s.before <= r.cap;
  return Math.max((r.target ?? 0) - s.before, r.consistency ? s.bestBefore / r.consistency - s.before : 0) <= r.cap;
}
export const MIN_TARGET = 25; // never aim for less than $25 (after costs)
export const COST_PER_CONTRACT = 1; // $ round trip, as tested

/** Today's goal for the account (section 5), before what today has made. */
export function dayGoal(stage: Stage, r: StageRules, s: Stats): number {
  if (stage === "funded") {
    if (r.payout && s.winDaysBefore >= r.payout.winDays) return Math.min(r.cap, r.payout.profit - s.before);
    return r.cap;
  }
  const needed = Math.max((r.target ?? 0) - s.before, r.consistency ? s.bestBefore / r.consistency - s.before : 0);
  return Math.min(r.cap, needed);
}

export type Signal = {
  session: PassSession;
  tradingDay: string; // YYYY-MM-DD, the trading day (18:00 New York starts the next)
  dir: Dir;
  price: number; // the signal bar's close
  bias: "UP" | "DOWN" | null; // the session's finished 4H candle body
  vah: number | null;
  val: number | null;
};
export type Card = { firm: Firm; stage: Stage; script: Script; dll: boolean; contracts: number };
export type Plan =
  | { take: false; reason: string }
  | { take: true; reason: string; risk: number; goalLeft: number; stopPts: number; targetPts: number; stopTicks: number; targetTicks: number };

const floorTick = (pts: number) => Math.floor(pts / TICK + 1e-9) * TICK;
export const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-GB")}`;

/** One account, one session's signal: take it or not, and the stop and target. */
export function plan(card: Card, s: Stats, sig: Signal): Plan {
  const r = stageRules(card.firm, card.stage, card.dll);
  const wd = new Date(`${sig.tradingDay}T12:00:00Z`).getUTCDay();
  if (wd === 0 || wd === 6) return { take: false, reason: "no trading day (weekend)" };
  const done = accountDone(card.stage, r, s);
  if (done) return { take: false, reason: done.text };

  const goal = dayGoal(card.stage, r, s);
  const left = goal - s.today;
  const last = finishing(card.stage, r, s);
  // Under $25 left of a day cap: the day is done. The last few dollars to a pass or payout are still worth one more trade.
  if (left <= 0 || (left < MIN_TARGET && !last)) return { take: false, reason: `today's goal reached (${money(s.today)} of ${money(goal)})` };
  if (r.dll !== null && s.today <= -r.dll) return { take: false, reason: `daily loss limit hit (${money(s.today)})` };
  const room = Math.min(s.profit - s.floor, r.dll !== null ? r.dll + s.today : Infinity);
  if (room < 25) return { take: false, reason: `less than $25 of room left (${money(room)})` };

  if (filtersApply(card.script, card.stage)) {
    if (sig.bias !== (sig.dir === "LONG" ? "UP" : "DOWN")) return { take: false, reason: `4H bias is ${sig.bias ?? "flat"}, the trade is ${sig.dir}` };
    if (sig.vah === null || sig.val === null) return { take: false, reason: "no value area to check against" };
    if (sig.price <= sig.vah && sig.price >= sig.val) return { take: false, reason: `price ${sig.price} is inside the value area (${sig.val}–${sig.vah})` };
  }

  const qty = Math.max(1, card.contracts);
  const risk = Math.min(r.risk, room);
  const stopPts = floorTick(risk / (qty * DOLLARS_PER_POINT));
  // The target covers the costs too, so hitting it really adds what's left (at least $25 when it finishes the account).
  const aim = (last ? Math.max(left, MIN_TARGET) : left) + qty * COST_PER_CONTRACT;
  const targetPts = Math.max(TICK, Math.ceil(aim / (qty * DOLLARS_PER_POINT) / TICK - 1e-9) * TICK);
  if (stopPts < TICK) return { take: false, reason: "stop would be under a tick" };
  return {
    take: true,
    reason: `risk ${money(risk)} · target ${money(targetPts * qty * DOLLARS_PER_POINT)} (left of today's ${money(goal)})`,
    risk,
    goalLeft: left,
    stopPts,
    targetPts,
    stopTicks: Math.round(stopPts / TICK),
    targetTicks: Math.round(targetPts / TICK),
  };
}

/** The trading day a moment belongs to: 18:00 New York starts the next one. */
export function passTradingDay(at: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  const d = new Date(`${g("year")}-${g("month")}-${g("day")}T12:00:00Z`);
  if (Number(g("hour")) >= 18) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
