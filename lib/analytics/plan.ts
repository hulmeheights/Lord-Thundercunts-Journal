/**
 * The income plan: for a monthly income you want, how many funded accounts
 * that takes, how many evals to buy to get there and keep it there, what the
 * fees come to, and how much real money could be out before the payouts land.
 *
 * Every rate comes from your own ledger once there's enough of it; until then
 * it falls back to a stated assumption you can change. Pure functions only, so
 * the maths is unit-tested.
 */
import type { RoadCounts } from "./road";

export type Rates = {
  /** Share of decided evals that pass. */
  passRate: number;
  /** What one eval (or reset) costs. */
  evalPrice: number;
  /** One payout, in your pocket. */
  avgPayout: number;
  /** Payouts per live funded account per month. */
  payoutsPerFundedMonth: number;
  /** Share of live funded accounts lost each month. */
  lossPerFundedMonth: number;
  /** Eval bought → passed. */
  daysToPass: number;
  /** Passed → first payout. */
  daysToPayout: number;
};
export type RateKey = keyof Rates;
export const RATE_KEYS: RateKey[] = ["passRate", "evalPrice", "avgPayout", "payoutsPerFundedMonth", "lossPerFundedMonth", "daysToPass", "daysToPayout"];

/**
 * Starting assumptions, from your own numbers: 59% pass at $500 risk, ~13 days
 * to pass, ~17 days from funded to a $1k payout, a payout every ~3 weeks.
 */
export const DEFAULT_RATES: Rates = {
  passRate: 0.59,
  evalPrice: 120,
  avgPayout: 1000,
  payoutsPerFundedMonth: 1.3,
  lossPerFundedMonth: 0.2,
  daysToPass: 13,
  daysToPayout: 17,
};

/** What each firm's eval costs you, before the ledger knows better. */
export const FIRM_PRICES: Record<string, number> = { topstep: 120, tradeify: 120, lucid: 230, lucidmaxx: 230 };

export type Source = "yours" | "assumed" | "set";
export type SourcedRates = { rates: Rates; source: Record<RateKey, Source>; basis: Partial<Record<RateKey, string>> };

/** Medians from the road, when it has them. */
export type RoadMedians = { daysToPass: number | null; daysToPayout: number | null };

/**
 * Your rates where the ledger has enough to say, the fallback where it doesn't,
 * and anything you've typed in wins over both.
 */
export function ratesFrom(c: RoadCounts | null, medians: RoadMedians, fallback: Rates, overrides: Partial<Rates> = {}): SourcedRates {
  const rates = { ...fallback };
  const source = Object.fromEntries(RATE_KEYS.map((k) => [k, "assumed"])) as Record<RateKey, Source>;
  const basis: Partial<Record<RateKey, string>> = {};
  const use = (k: RateKey, v: number | null, why: string) => {
    if (v === null || !Number.isFinite(v)) return;
    rates[k] = v;
    source[k] = "yours";
    basis[k] = why;
  };
  if (c) {
    const decided = c.passed + c.blown;
    // One copied batch of 5 that all passed isn't a 100% pass rate yet: lean on the
    // assumption (as if it were 10 more evals) until there are 30 decided.
    if (decided >= 3) {
      const w = decided >= 30 ? 0 : 10;
      use("passRate", (c.passed + fallback.passRate * w) / (decided + w), `${c.passed} of ${decided} evals${w ? ", blended with the assumption until 30" : ""}`);
    }
    if (c.attempts >= 1 && c.attemptSpend > 0) use("evalPrice", c.attemptSpend / c.attempts, `${c.attempts} bought`);
    if (c.payouts >= 1 && c.paidOut > 0) use("avgPayout", c.paidOut / c.payouts, `${c.payouts} payouts`);
    // A month of funded life is the least that says anything about how often an account pays or dies.
    if (c.fundedMonths >= 1 && c.payouts >= 1) use("payoutsPerFundedMonth", c.payouts / c.fundedMonths, `${c.fundedMonths.toFixed(1)} funded-months`);
    if (c.fundedMonths >= 1) use("lossPerFundedMonth", Math.min(1, c.fundedLost / c.fundedMonths), `${c.fundedLost} lost in ${c.fundedMonths.toFixed(1)} funded-months`);
  }
  if (medians.daysToPass !== null) use("daysToPass", medians.daysToPass, "median");
  if (medians.daysToPayout !== null) use("daysToPayout", medians.daysToPayout, "median");
  for (const k of RATE_KEYS) {
    const v = overrides[k];
    if (v !== undefined && Number.isFinite(v) && v >= 0) {
      rates[k] = v;
      source[k] = "set";
      delete basis[k];
    }
  }
  return { rates, source, basis };
}

/** P(X ≥ k) for X ~ Binomial(n, p). */
function atLeast(n: number, p: number, k: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let term = Math.pow(1 - p, n); // P(X = 0)
  let below = 0;
  for (let i = 0; i < k; i++) {
    below += term;
    term = (term * (n - i) * p) / ((i + 1) * (1 - p));
  }
  return Math.max(0, 1 - below);
}

export type Plan = {
  target: number;
  /** Payouts a month the target takes. */
  payoutsPerMonth: number;
  /** Funded accounts that have to be live at once. */
  liveFunded: number;
  /** Evals to buy to get that many funded, on average. */
  evalsToStart: number;
  startFees: number;
  /** With copied batches: what the start could cost when it goes badly (1 month in 10 is worse). */
  badStartEvals: number;
  badStartFees: number;
  /** Funded accounts lost a month at that size, so passes needed just to stand still. */
  passesPerMonth: number;
  evalsPerMonth: number;
  monthlyFees: number;
  /** Target less the fees it takes to keep it going. */
  netPerMonth: number;
  /** Eval bought → first payout. */
  daysToFirstPayout: number;
  /** Real money that can be out before the first payout: the bad start. */
  realMoneyAtRisk: number;
  /** Fees per dollar paid out, steady state. */
  feeShare: number | null;
};

export function planFor(target: number, r: Rates, batch = 5): Plan | null {
  if (!(target > 0) || !(r.avgPayout > 0) || !(r.payoutsPerFundedMonth > 0) || !(r.passRate > 0)) return null;
  const b = Math.max(1, Math.round(batch));
  const payoutsPerMonth = target / r.avgPayout;
  const liveFunded = Math.ceil(payoutsPerMonth / r.payoutsPerFundedMonth - 1e-9);
  // Copied batches pass or fail together, so count in batches.
  const batchesNeeded = Math.ceil(liveFunded / b);
  const p = Math.min(1, r.passRate);
  const evalsToStart = Math.ceil(batchesNeeded / p - 1e-9) * b;
  // How many batches give a 90% chance of enough passes.
  let k = batchesNeeded;
  while (k < 2000 && atLeast(k, p, batchesNeeded) < 0.9) k++;
  const badStartEvals = k * b;
  const passesPerMonth = liveFunded * r.lossPerFundedMonth;
  const evalsPerMonth = passesPerMonth / r.passRate;
  const monthlyFees = evalsPerMonth * r.evalPrice;
  const round = (x: number) => Math.round(x * 100) / 100;
  return {
    target,
    payoutsPerMonth: round(payoutsPerMonth),
    liveFunded,
    evalsToStart,
    startFees: round(evalsToStart * r.evalPrice),
    badStartEvals,
    badStartFees: round(badStartEvals * r.evalPrice),
    passesPerMonth: round(passesPerMonth),
    evalsPerMonth: round(evalsPerMonth),
    monthlyFees: round(monthlyFees),
    netPerMonth: round(target - monthlyFees),
    daysToFirstPayout: Math.round(r.daysToPass + r.daysToPayout),
    realMoneyAtRisk: round(badStartEvals * r.evalPrice),
    feeShare: target > 0 ? monthlyFees / target : null,
  };
}
