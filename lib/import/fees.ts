import { rootFromSymbol } from "../brokers/contracts";

/**
 * Commission schedules (USD per contract, ROUND TURN) used to back-fill fees
 * when an export doesn't include them (e.g. Tradovate Orders/Performance CSVs).
 */
const LUCID_PER_SIDE: Record<string, number> = {
  ES: 1.75, NQ: 1.75, RTY: 1.75, YM: 1.75, NKD: 1.75,
  MES: 0.5, MNQ: 0.5, M2K: 0.5, MYM: 0.5, MCL: 0.5,
  CL: 2.0, QM: 2.0, NG: 2.0,
  GC: 2.3, SI: 2.3, HG: 2.3, PL: 2.3,
  MGC: 0.8, SIL: 1.6,
  "6A": 2.4, "6B": 2.4, "6C": 2.4, "6E": 2.4, "6J": 2.4, "6S": 2.4, "6N": 2.4,
  QG: 1.3,
  ZC: 2.8, ZS: 2.8, ZW: 2.8, ZL: 2.8, ZM: 2.8, LE: 2.8, HE: 2.8, GF: 2.8,
};

export const FEE_SCHEDULES: { id: string; label: string; perRoundTurn: (root: string) => number }[] = [
  { id: "none", label: "No fees", perRoundTurn: () => 0 },
  { id: "lucid", label: "Lucid rates", perRoundTurn: (r) => (LUCID_PER_SIDE[r] ?? 0) * 2 },
];

export function feeResolver(scheduleId: string, flat: number): (symbol: string) => number {
  if (scheduleId === "flat") return () => flat;
  const s = FEE_SCHEDULES.find((x) => x.id === scheduleId) ?? FEE_SCHEDULES[0]!;
  return (symbol) => s.perRoundTurn(rootFromSymbol(symbol.toUpperCase().replace(/^[/@]/, "")));
}
