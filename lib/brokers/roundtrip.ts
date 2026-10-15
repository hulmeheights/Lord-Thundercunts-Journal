import { rootFromSymbol } from "./contracts";

/** A single execution as reported by a broker, normalised. */
export type NormalizedFill = {
  id: string; // globally unique, e.g. "topstepx:8604"
  provider: string;
  accountId: string;
  contractId: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  ts: string; // ISO
  fees: number;
  brokerPnl: number | null; // realised P&L reported on closing fills (if any)
  pointValue: number;
};

export type BuiltTrade = {
  id: string;
  source: string;
  accountId: string;
  symbol: string;
  root: string;
  direction: "long" | "short";
  qty: number; // total contracts opened
  maxPosition: number;
  entryTime: string;
  exitTime: string;
  entryPrice: number; // volume-weighted
  exitPrice: number; // volume-weighted
  grossPnl: number;
  fees: number;
  netPnl: number;
  pointValue: number;
  fillCount: number;
};

type Leg = { qty: number; price: number; ts: string };

type Open = {
  id: string;
  direction: "long" | "short";
  entries: Leg[];
  exits: Leg[];
  fees: number;
  brokerPnl: number;
  brokerPnlComplete: boolean;
  maxPosition: number;
  fillIds: Set<string>;
};

const EPS = 1e-9;

/**
 * Turns raw fills into round-trip trades. A trade runs from flat to flat on
 * one contract in one account, so scaling in and out stays a single trade.
 * Reversals (e.g. selling 2 while long 1) close the trade and open a new one.
 */
export function buildRoundTrips(fills: NormalizedFill[]): { trades: BuiltTrade[]; openPositions: number } {
  const groups = new Map<string, NormalizedFill[]>();
  for (const f of fills) {
    const key = `${f.accountId}|${f.contractId}`;
    const list = groups.get(key);
    if (list) list.push(f);
    else groups.set(key, [f]);
  }

  const trades: BuiltTrade[] = [];
  let openPositions = 0;

  for (const list of groups.values()) {
    list.sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id, undefined, { numeric: true }));
    let position = 0; // signed contracts
    let cur: Open | null = null;
    const first = list[0]!;

    const finalize = (o: Open) => {
      const inQty = o.entries.reduce((s, l) => s + l.qty, 0);
      const outQty = o.exits.reduce((s, l) => s + l.qty, 0);
      const inVal = o.entries.reduce((s, l) => s + l.qty * l.price, 0);
      const outVal = o.exits.reduce((s, l) => s + l.qty * l.price, 0);
      const points = o.direction === "long" ? outVal - inVal : inVal - outVal;
      const computed = points * first.pointValue;
      const gross = o.brokerPnlComplete ? o.brokerPnl : computed;
      trades.push({
        id: o.id,
        source: first.provider,
        accountId: first.accountId,
        symbol: first.symbol,
        root: rootFromSymbol(first.symbol),
        direction: o.direction,
        qty: inQty,
        maxPosition: o.maxPosition,
        entryTime: o.entries[0]!.ts,
        exitTime: o.exits[o.exits.length - 1]!.ts,
        entryPrice: inVal / inQty,
        exitPrice: outVal / outQty,
        grossPnl: round2(gross),
        fees: round2(o.fees),
        netPnl: round2(gross - o.fees),
        pointValue: first.pointValue,
        fillCount: o.fillIds.size,
      });
    };

    for (const f of list) {
      if (!(f.qty > 0)) continue;
      const signed = f.side === "buy" ? f.qty : -f.qty;
      let remaining = signed;
      let pnlAssigned = false;

      while (Math.abs(remaining) > EPS) {
        if (Math.abs(position) < EPS || !cur) {
          // Open a new trade with whatever is left of this fill.
          const reversal = Math.abs(remaining - signed) > EPS;
          cur = {
            id: `${f.id}${reversal ? "r" : ""}`,
            direction: remaining > 0 ? "long" : "short",
            entries: [],
            exits: [],
            fees: 0,
            brokerPnl: 0,
            brokerPnlComplete: true,
            maxPosition: 0,
            fillIds: new Set(),
          };
          position = 0;
        }
        const sameSide = Math.sign(remaining) === Math.sign(position) || Math.abs(position) < EPS;
        if (sameSide) {
          const q = Math.abs(remaining);
          cur.entries.push({ qty: q, price: f.price, ts: f.ts });
          cur.fees += f.fees * (q / f.qty);
          cur.fillIds.add(f.id);
          position += remaining;
          cur.maxPosition = Math.max(cur.maxPosition, Math.abs(position));
          remaining = 0;
        } else {
          const q = Math.min(Math.abs(remaining), Math.abs(position));
          cur.exits.push({ qty: q, price: f.price, ts: f.ts });
          cur.fees += f.fees * (q / f.qty);
          cur.fillIds.add(f.id);
          if (!pnlAssigned) {
            if (f.brokerPnl === null) cur.brokerPnlComplete = false;
            else cur.brokerPnl += f.brokerPnl;
            pnlAssigned = true;
          }
          const step = Math.sign(remaining) * q;
          position += step;
          remaining -= step;
          if (Math.abs(position) < EPS) {
            finalize(cur);
            cur = null;
            position = 0;
          }
        }
      }
    }
    if (cur && Math.abs(position) > EPS) openPositions++;
  }

  trades.sort((a, b) => a.exitTime.localeCompare(b.exitTime));
  return { trades, openPositions };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
