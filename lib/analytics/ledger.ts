/**
 * The eval ledger: what prop-firm evaluations have cost and what they've paid
 * back. Pure functions only — no I/O — so the maths is unit-tested.
 *
 * Every amount is stored positive; the kind decides the direction. Payouts and
 * refunds come in, everything else goes out.
 */

export const LEDGER_KINDS = ["evaluation", "reset", "activation", "subscription", "payout", "refund", "other"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export type LedgerEntry = {
  id: string;
  day: string; // YYYY-MM-DD
  firm: string;
  account: string | null;
  kind: LedgerKind;
  amount: number; // always >= 0
  note: string | null;
  createdAt: string | null;
};

export const KIND_LABEL: Record<LedgerKind, string> = {
  evaluation: "Evaluation",
  reset: "Reset",
  activation: "Activation",
  subscription: "Subscription",
  payout: "Payout",
  refund: "Refund",
  other: "Other",
};

/** Firms the owner trades with, in the order the form suggests them. */
export const FIRM_SUGGESTIONS = ["Topstep", "Lucid", "Tradeify", "Apex", "Take Profit Trader"] as const;

export function isInflow(kind: LedgerKind): boolean {
  return kind === "payout" || kind === "refund";
}

/** The entry's effect on the owner's pocket: payouts/refunds positive, costs negative. */
export function signedAmount(e: Pick<LedgerEntry, "kind" | "amount">): number {
  return isInflow(e.kind) ? e.amount : -e.amount;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type FirmLedger = {
  firm: string;
  spent: number;
  /** spent less refunds: what this firm has actually cost. */
  cost: number;
  received: number;
  paidOut: number;
  refunds: number;
  net: number;
  evals: number;
  payouts: number;
  entries: number;
};

export type MonthLedger = {
  month: string; // YYYY-MM
  spent: number;
  received: number;
  net: number;
  cumNet: number;
  cumSpent: number;
  cumReceived: number;
};

export type LedgerSummary = {
  count: number;
  /** Everything that went out: evaluations, resets, activations, subscriptions, other. */
  spent: number;
  /** What the evals have actually cost: spent less refunds. paidOut − cost = net. */
  cost: number;
  /** Everything that came back: payouts plus refunds. */
  received: number;
  /** Payouts only. */
  paidOut: number;
  refunds: number;
  net: number;
  /** net / cost, or null before anything has been spent. */
  roi: number | null;
  /** Evaluation accounts bought. */
  evals: number;
  resets: number;
  activations: number;
  payouts: number;
  /** What each payout has cost on average (cost / payouts), null before the first payout. */
  costPerPayout: number | null;
  /** How much a further payout would need to be to square the ledger (0 when already square). */
  toBreakEven: number;
  firstDay: string | null;
  lastDay: string | null;
  byFirm: FirmLedger[];
  byMonth: MonthLedger[];
  byKind: Record<LedgerKind, { count: number; total: number }>;
};

/** Case- and space-insensitive key so "topstep " and "Topstep" are one firm. */
export function firmKey(firm: string): string {
  return firm.trim().replace(/\s+/g, " ").toLowerCase();
}

function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}

/** Every month from `from` to `to` inclusive (YYYY-MM). */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  if (from > to) return out;
  let m = from;
  // Bounded so a malformed range can never loop forever.
  for (let i = 0; i < 600 && m <= to; i++) {
    out.push(m);
    m = nextMonth(m);
  }
  return out;
}

export function summarizeLedger(entries: readonly LedgerEntry[]): LedgerSummary {
  const byKind = Object.fromEntries(LEDGER_KINDS.map((k) => [k, { count: 0, total: 0 }])) as Record<LedgerKind, { count: number; total: number }>;
  const firms = new Map<string, FirmLedger>();
  const months = new Map<string, { spent: number; received: number }>();
  let spent = 0, received = 0, paidOut = 0, refunds = 0;
  let firstDay: string | null = null, lastDay: string | null = null;

  for (const e of entries) {
    const amt = Math.max(0, Number.isFinite(e.amount) ? e.amount : 0);
    const inflow = isInflow(e.kind);
    byKind[e.kind].count++;
    byKind[e.kind].total += amt;
    if (inflow) received += amt;
    else spent += amt;
    if (e.kind === "payout") paidOut += amt;
    if (e.kind === "refund") refunds += amt;
    if (!firstDay || e.day < firstDay) firstDay = e.day;
    if (!lastDay || e.day > lastDay) lastDay = e.day;

    const key = firmKey(e.firm) || "other";
    const f = firms.get(key) ?? { firm: e.firm.trim().replace(/\s+/g, " ") || "Other", spent: 0, cost: 0, received: 0, paidOut: 0, refunds: 0, net: 0, evals: 0, payouts: 0, entries: 0 };
    f.entries++;
    if (inflow) f.received += amt;
    else f.spent += amt;
    if (e.kind === "payout") {
      f.paidOut += amt;
      f.payouts++;
    }
    if (e.kind === "refund") f.refunds += amt;
    if (e.kind === "evaluation") f.evals++;
    firms.set(key, f);

    const mk = e.day.slice(0, 7);
    const m = months.get(mk) ?? { spent: 0, received: 0 };
    if (inflow) m.received += amt;
    else m.spent += amt;
    months.set(mk, m);
  }

  const byFirm = [...firms.values()]
    .map((f) => ({
      ...f,
      spent: round2(f.spent),
      cost: round2(f.spent - f.refunds),
      received: round2(f.received),
      paidOut: round2(f.paidOut),
      refunds: round2(f.refunds),
      net: round2(f.received - f.spent),
    }))
    // Most money moved first: that's the relationship that matters most.
    .sort((a, b) => b.spent + b.received - (a.spent + a.received) || a.firm.localeCompare(b.firm));

  const byMonth: MonthLedger[] = [];
  if (firstDay && lastDay) {
    let cumNet = 0, cumSpent = 0, cumReceived = 0;
    for (const month of monthRange(firstDay.slice(0, 7), lastDay.slice(0, 7))) {
      const m = months.get(month) ?? { spent: 0, received: 0 };
      cumSpent += m.spent;
      cumReceived += m.received;
      cumNet = cumReceived - cumSpent;
      byMonth.push({
        month,
        spent: round2(m.spent),
        received: round2(m.received),
        net: round2(m.received - m.spent),
        cumNet: round2(cumNet),
        cumSpent: round2(cumSpent),
        cumReceived: round2(cumReceived),
      });
    }
  }

  for (const k of LEDGER_KINDS) byKind[k].total = round2(byKind[k].total);
  const net = round2(received - spent);
  const cost = round2(spent - refunds);
  const payouts = byKind.payout.count;

  return {
    count: entries.length,
    spent: round2(spent),
    cost,
    received: round2(received),
    paidOut: round2(paidOut),
    refunds: round2(refunds),
    net,
    roi: cost > 0 ? net / cost : null,
    evals: byKind.evaluation.count,
    resets: byKind.reset.count,
    activations: byKind.activation.count,
    payouts,
    costPerPayout: payouts > 0 ? round2(Math.max(0, cost) / payouts) : null,
    toBreakEven: net < 0 ? -net : 0,
    firstDay,
    lastDay,
    byFirm,
    byMonth,
    byKind,
  };
}

/** Newest first; ties broken by creation time so a just-added entry leads its day. */
export function sortEntries(entries: readonly LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => b.day.localeCompare(a.day) || (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id.localeCompare(a.id));
}

/** Group sorted entries into months (newest month first) with each month's net. */
export function groupByMonth(entries: readonly LedgerEntry[]): { month: string; net: number; entries: LedgerEntry[] }[] {
  const out: { month: string; net: number; entries: LedgerEntry[] }[] = [];
  for (const e of sortEntries(entries)) {
    const m = e.day.slice(0, 7);
    let g = out[out.length - 1];
    if (!g || g.month !== m) {
      g = { month: m, net: 0, entries: [] };
      out.push(g);
    }
    g.entries.push(e);
    g.net = round2(g.net + signedAmount(e));
  }
  return out;
}
