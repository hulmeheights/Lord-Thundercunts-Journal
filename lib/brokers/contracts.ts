/** Futures contract metadata helpers (pure, client-safe). */

const MONTH_CODES = "FGHJKMNQUVXZ";

/** Dollar value of a one-point move, used when the broker doesn't tell us. */
export const POINT_VALUES: Record<string, number> = {
  ES: 50, MES: 5, NQ: 20, MNQ: 2, YM: 5, MYM: 0.5, RTY: 50, M2K: 5, EMD: 100,
  CL: 1000, MCL: 100, QM: 500, NG: 10000, QG: 2500, RB: 42000, HO: 42000,
  GC: 100, MGC: 10, SI: 5000, SIL: 1000, HG: 25000, MHG: 2500, PL: 50, PA: 100,
  ZB: 1000, UB: 1000, ZN: 1000, TN: 1000, ZF: 1000, ZT: 2000,
  "6E": 125000, M6E: 12500, "6B": 62500, M6B: 6250, "6J": 12500000, "6A": 100000, M6A: 10000, "6C": 100000, "6S": 125000, "6M": 500000, "6N": 100000,
  ZC: 50, ZS: 50, ZW: 50, ZL: 600, ZM: 100, LE: 400, HE: 400, GF: 500,
  BTC: 5, MBT: 0.1, ETH: 50, MET: 0.1, NKD: 5, VX: 1000,
};

/** ProjectX symbol ids that differ from the CME root. */
const PROJECTX_ROOTS: Record<string, string> = {
  EP: "ES", ENQ: "NQ", CLE: "CL", MCLE: "MCL", GCE: "GC", MGCE: "MGC", SIE: "SI", HGE: "HG", NGE: "NG",
  "6EE": "6E", "6BE": "6B", "6JE": "6J", "6AE": "6A", "6CE": "6C", TYA: "ZN", USA: "ZB", FVA: "ZF", TUA: "ZT",
};

/** "MNQZ5" → "MNQ", "ESH25" → "ES". */
export function rootFromSymbol(symbol: string): string {
  const s = symbol.toUpperCase().trim();
  const m = /^([A-Z0-9]+?)([FGHJKMNQUVXZ])(\d{1,2})$/.exec(s);
  if (m && MONTH_CODES.includes(m[2]!)) return m[1]!;
  return s;
}

/** "CON.F.US.ENQ.H25" → { root: "NQ", symbol: "NQH5" } */
export function parseProjectXContractId(id: string): { root: string; symbol: string } {
  const parts = id.split(".");
  const sym = parts[3] ?? id;
  const expiry = parts[4] ?? "";
  const root = PROJECTX_ROOTS[sym] ?? sym;
  const symbol = expiry ? `${root}${expiry.slice(0, 1)}${expiry.slice(-1)}` : root;
  return { root, symbol };
}

export function pointValueFor(root: string): number | null {
  return POINT_VALUES[root.toUpperCase()] ?? null;
}
