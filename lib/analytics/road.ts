/**
 * The road to paid: how long an eval takes to pass, how many attempts a pass
 * costs, and how long from passing (or from buying the eval) to a payout.
 *
 * Ledger lines aren't tied to one account, so each firm is read first in, first
 * out: a "passed" or "blown" line closes the oldest open attempt at that firm,
 * a payout goes to the oldest funded account there that hasn't been paid yet,
 * and a "blown funded" line closes the oldest funded account still standing.
 * That's exact when you work accounts in the order you buy them, and a fair
 * estimate when you don't. Pure functions only, so the maths is unit-tested.
 */
import { firmKey, qtyOf, type LedgerEntry, type LedgerKind } from "./ledger";

export type Spread = {
  /** How many measurements went in. */
  n: number;
  median: number | null;
  /** The middle half (25th–75th percentile) once there are four or more; otherwise the full range. */
  low: number | null;
  high: number | null;
};

/** The raw counts a plan is built from. */
export type RoadCounts = {
  attempts: number; // evals and resets bought
  attemptSpend: number; // what those cost
  passed: number;
  blown: number;
  payouts: number;
  paidOut: number;
  fundedLost: number;
  /** Funded account-days lived so far (passed → lost, or → today), in months of 30 days. */
  fundedMonths: number;
};

export type FirmRoad = {
  firm: string;
  counts: RoadCounts;
  attemptsPerPass: number | null;
  daysToPass: Spread;
  daysPassToPayout: Spread;
  daysEvalToPayout: Spread;
};

/** Result lines that had nothing to attach to, so you can fix the ledger. */
export type Unmatched = { firm: string; kind: "passed" | "blown" | "funded_blown" | "payout"; count: number };

export type Road = {
  /** Evals decided (passed + blown) per pass: how many goes one funded account takes. */
  attemptsPerPass: number | null;
  daysToPass: Spread;
  /** How long an eval lasts when it's blown. */
  daysToBlow: Spread;
  /** Passed → first payout on that account. */
  daysPassToPayout: Spread;
  /** Eval bought → first payout on that same account: the whole road. */
  daysEvalToPayout: Spread;
  /** Gaps between one payout and the next at the same firm. */
  daysBetweenPayouts: Spread;
  /** Passed → blown, for funded accounts that were lost. */
  fundedLifeDays: Spread;
  /** Share of funded accounts that have been paid at least once. */
  fundedPaidRate: number | null;
  fundedPaid: number;
  fundedTotal: number;
  /** Fees spent per funded account that has been paid at least once. */
  feesPerPaidAccount: number | null;
  byFirm: FirmRoad[];
  unmatched: Unmatched[];
  counts: RoadCounts;
};

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS));

/** Same-day lines in a sensible order: buy, then decide, then get paid. */
const ORDER: Record<LedgerKind, number> = {
  evaluation: 0, reset: 0, activation: 1, subscription: 1, other: 1, refund: 1, passed: 2, blown: 2, funded_blown: 4, payout: 3,
};

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

export function spread(values: number[]): Spread {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return { n: 0, median: null, low: null, high: null };
  const r = (x: number) => Math.round(x * 10) / 10;
  const wide = v.length >= 4;
  return { n: v.length, median: r(quantile(v, 0.5)), low: r(wide ? quantile(v, 0.25) : v[0]!), high: r(wide ? quantile(v, 0.75) : v[v.length - 1]!) };
}

type Funded = { passDay: string; attemptDay: string | null; paid: boolean; alive: boolean; lostDay: string | null };
type Track = {
  firm: string;
  attempts: string[]; // the day each open attempt was bought
  funded: Funded[];
  passed: number;
  blown: number;
  toPass: number[];
  toBlow: number[];
  passToPayout: number[];
  evalToPayout: number[];
  payoutDays: string[];
  fundedLife: number[];
  miss: Record<Unmatched["kind"], number>;
  bought: number;
  attemptSpend: number;
  payouts: number;
  paidOut: number;
};

export function roadToPaid(entries: readonly LedgerEntry[], cost: number, asOf?: string): Road {
  const sorted = [...entries].sort((a, b) => a.day.localeCompare(b.day) || ORDER[a.kind] - ORDER[b.kind] || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const tracks = new Map<string, Track>();

  for (const e of sorted) {
    const key = firmKey(e.firm) || "other";
    let t = tracks.get(key);
    if (!t) {
      t = { firm: e.firm.trim().replace(/\s+/g, " ") || "Other", attempts: [], funded: [], passed: 0, blown: 0, toPass: [], toBlow: [], passToPayout: [], evalToPayout: [], payoutDays: [], fundedLife: [], miss: { passed: 0, blown: 0, funded_blown: 0, payout: 0 }, bought: 0, attemptSpend: 0, payouts: 0, paidOut: 0 };
      tracks.set(key, t);
    }
    const q = qtyOf(e);
    for (let i = 0; i < q; i++) {
      if (e.kind === "evaluation" || e.kind === "reset") {
        t.attempts.push(e.day);
        t.bought++;
      }
      else if (e.kind === "passed") {
        const bought = t.attempts.shift() ?? null;
        t.passed++;
        if (bought) t.toPass.push(daysBetween(bought, e.day));
        else t.miss.passed++;
        t.funded.push({ passDay: e.day, attemptDay: bought, paid: false, alive: true, lostDay: null });
      } else if (e.kind === "blown") {
        const bought = t.attempts.shift() ?? null;
        t.blown++;
        if (bought) t.toBlow.push(daysBetween(bought, e.day));
        else t.miss.blown++;
      } else if (e.kind === "funded_blown") {
        const f = t.funded.find((x) => x.alive);
        if (f) {
          f.alive = false;
          f.lostDay = e.day;
          t.fundedLife.push(daysBetween(f.passDay, e.day));
        } else t.miss.funded_blown++;
      } else if (e.kind === "payout") {
        const f = t.funded.find((x) => !x.paid && x.alive) ?? t.funded.find((x) => !x.paid);
        if (f) {
          f.paid = true;
          t.passToPayout.push(daysBetween(f.passDay, e.day));
          if (f.attemptDay) t.evalToPayout.push(daysBetween(f.attemptDay, e.day));
        } else if (!t.funded.length) t.miss.payout++; // repeat payouts on an already-paid account are fine
      }
    }
    if (e.kind === "payout") {
      t.payoutDays.push(e.day);
      t.payouts += q;
      t.paidOut += Math.max(0, e.amount);
    }
    if (e.kind === "evaluation" || e.kind === "reset") t.attemptSpend += Math.max(0, e.amount);
  }

  const all = [...tracks.values()];
  const end = asOf ?? sorted[sorted.length - 1]?.day ?? "2000-01-01";
  const countsOf = (ts: Track[]): RoadCounts => {
    const fundedDays = ts.flatMap((t) => t.funded).reduce((n, f) => n + Math.max(0, daysBetween(f.passDay, f.lostDay ?? (end > f.passDay ? end : f.passDay))), 0);
    return {
      attempts: ts.reduce((n, t) => n + t.bought, 0),
      attemptSpend: Math.round(ts.reduce((n, t) => n + t.attemptSpend, 0) * 100) / 100,
      passed: ts.reduce((n, t) => n + t.passed, 0),
      blown: ts.reduce((n, t) => n + t.blown, 0),
      payouts: ts.reduce((n, t) => n + t.payouts, 0),
      paidOut: Math.round(ts.reduce((n, t) => n + t.paidOut, 0) * 100) / 100,
      fundedLost: ts.reduce((n, t) => n + t.fundedLife.length, 0),
      fundedMonths: Math.round((fundedDays / 30) * 100) / 100,
    };
  };
  const flat = (pick: (t: Track) => number[]) => all.flatMap(pick);
  const gaps = all.flatMap((t) => {
    const days = [...new Set(t.payoutDays)].sort();
    return days.slice(1).map((d, i) => daysBetween(days[i]!, d));
  });
  const passed = all.reduce((n, t) => n + t.passed, 0);
  const blown = all.reduce((n, t) => n + t.blown, 0);
  const fundedTotal = all.reduce((n, t) => n + t.funded.length, 0);
  const fundedPaid = all.reduce((n, t) => n + t.funded.filter((f) => f.paid).length, 0);

  return {
    attemptsPerPass: passed > 0 ? (passed + blown) / passed : null,
    daysToPass: spread(flat((t) => t.toPass)),
    daysToBlow: spread(flat((t) => t.toBlow)),
    daysPassToPayout: spread(flat((t) => t.passToPayout)),
    daysEvalToPayout: spread(flat((t) => t.evalToPayout)),
    daysBetweenPayouts: spread(gaps),
    fundedLifeDays: spread(flat((t) => t.fundedLife)),
    fundedPaidRate: fundedTotal > 0 ? fundedPaid / fundedTotal : null,
    fundedPaid,
    fundedTotal,
    feesPerPaidAccount: fundedPaid > 0 ? Math.round((Math.max(0, cost) / fundedPaid) * 100) / 100 : null,
    byFirm: all
      .filter((t) => t.bought + t.passed + t.blown + t.payouts > 0)
      .map((t) => ({
        firm: t.firm,
        counts: countsOf([t]),
        attemptsPerPass: t.passed > 0 ? (t.passed + t.blown) / t.passed : null,
        daysToPass: spread(t.toPass),
        daysPassToPayout: spread(t.passToPayout),
        daysEvalToPayout: spread(t.evalToPayout),
      }))
      .sort((a, b) => b.daysToPass.n - a.daysToPass.n || a.firm.localeCompare(b.firm)),
    counts: countsOf(all),
    unmatched: all.flatMap((t) =>
      (Object.keys(t.miss) as Unmatched["kind"][]).filter((k) => t.miss[k] > 0).map((k) => ({ firm: t.firm, kind: k, count: t.miss[k] })),
    ),
  };
}
