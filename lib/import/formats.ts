import { normHeader } from "./csv";
import { parseDateTime, parseNumber, parseSide, type DateOrder } from "./values";

/** One completed round-trip trade read from an export. */
export type ImportedTrade = {
  kind: "trade";
  key: string; // stable per-row identity for de-duplication
  symbol: string;
  direction: "long" | "short";
  qty: number;
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  grossPnl: number | null; // null → computed from prices × point value
  fees: number;
  account: string | null;
};

/** One execution read from an export (paired into trades later). */
export type ImportedFill = {
  kind: "fill";
  key: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  time: string;
  fees: number;
  account: string | null;
};

export type Field =
  | "symbol" | "account" | "id" | "qty" | "fees" | "commissions" | "pnl"
  // round trips
  | "entryTime" | "exitTime" | "entryPrice" | "exitPrice" | "direction" | "buyTime" | "sellTime" | "buyPrice" | "sellPrice"
  // fills
  | "time" | "side" | "price" | "status";

/** Header aliases (normalised: lowercase alphanumerics). Order = priority. */
const ALIASES: Record<Field, string[]> = {
  symbol: ["contractname", "symbol", "contract", "instrument", "market", "ticker", "product", "contractid"],
  account: ["account", "accountname", "accountid", "accountnumber"],
  id: ["tradeid", "id", "fillid", "execid", "executionid", "tradenumber", "orderid", "ordernumber"],
  qty: ["size", "qty", "quantity", "filledqty", "qtyfilled", "fillqty", "contracts", "positionsize", "filled"],
  fees: ["fees", "fee", "totalfees", "exchangefees"],
  commissions: ["commissions", "commission", "comm", "totalcommissions"],
  pnl: ["pnl", "profitandloss", "profit", "realizedpnl", "grosspnl", "pl", "profitloss", "netpnl", "netprofit"],
  entryTime: ["enteredat", "entrytime", "entrydatetime", "opentime", "openedat", "entrydate", "timeopened"],
  exitTime: ["exitedat", "exittime", "exitdatetime", "closetime", "closedat", "exitdate", "timeclosed"],
  entryPrice: ["entryprice", "avgentryprice", "openprice", "averageentryprice", "entry"],
  exitPrice: ["exitprice", "avgexitprice", "closeprice", "averageexitprice", "exit"],
  direction: ["type", "direction", "side", "marketpos", "position", "longshort", "tradetype"],
  buyTime: ["boughttimestamp", "buytime", "boughttime"],
  sellTime: ["soldtimestamp", "selltime", "soldtime"],
  buyPrice: ["buyprice", "avgbuyprice"],
  sellPrice: ["sellprice", "avgsellprice"],
  time: ["filltime", "timestamp", "updatetime", "time", "datetime", "executiontime", "creationtimestamp", "createdat", "createtime", "date", "filledat"],
  side: ["bs", "buysell", "side", "action", "direction"],
  price: ["fillprice", "price", "avgprice", "avgfillprice", "executionprice", "averageprice"],
  status: ["status", "orderstatus"],
};

export type Mapping = Partial<Record<Field, number>>;

export function autoMap(headers: string[]): Mapping {
  const norm = headers.map(normHeader);
  const used = new Set<number>();
  const map: Mapping = {};
  const order: Field[] = [
    "buyTime", "sellTime", "buyPrice", "sellPrice", "entryTime", "exitTime", "entryPrice", "exitPrice",
    "symbol", "account", "id", "qty", "fees", "commissions", "pnl", "time", "price", "side", "direction", "status",
  ];
  for (const f of order) {
    for (const alias of ALIASES[f]) {
      const i = norm.findIndex((h, idx) => !used.has(idx) && h === alias);
      if (i >= 0) {
        map[f] = i;
        used.add(i);
        break;
      }
    }
  }
  return map;
}

export type Shape = "tradovate-performance" | "round-trips" | "fills" | "unknown";

export function detectShape(map: Mapping): Shape {
  if (map.buyTime !== undefined && map.sellTime !== undefined && map.buyPrice !== undefined && map.sellPrice !== undefined) {
    return "tradovate-performance";
  }
  if (map.entryTime !== undefined && map.exitTime !== undefined && map.entryPrice !== undefined && map.exitPrice !== undefined) {
    return "round-trips";
  }
  if ((map.time !== undefined || map.entryTime !== undefined) && (map.side !== undefined || map.direction !== undefined) && map.price !== undefined && map.qty !== undefined) {
    return "fills";
  }
  return "unknown";
}

export const SHAPE_LABEL: Record<Shape, string> = {
  "tradovate-performance": "Tradovate performance report (round trips)",
  "round-trips": "Completed trades (round trips)",
  fills: "Executions / fills",
  unknown: "Unrecognised layout",
};

function directionFrom(raw: string | undefined): "long" | "short" | null {
  const s = (raw ?? "").toLowerCase();
  if (/long|buy|^b$/.test(s)) return "long";
  if (/short|sell|^s$/.test(s)) return "short";
  return null;
}

function cell(row: string[], i: number | undefined): string | undefined {
  return i === undefined ? undefined : row[i];
}

export type ParseResult = {
  shape: Shape;
  items: (ImportedTrade | ImportedFill)[];
  skipped: number;
  errors: string[];
};

/**
 * Turns parsed CSV rows into trades or fills. `feePerContract` (round turn)
 * is applied when the export has no fee column.
 */
export function mapRows(
  rows: string[][],
  opts: { tz: string; dateOrder?: DateOrder; mapping?: Mapping; feePerContract?: number | ((symbol: string) => number) },
): ParseResult {
  const [headers, ...data] = rows;
  if (!headers) return { shape: "unknown", items: [], skipped: 0, errors: ["The file is empty."] };
  const map = opts.mapping ?? autoMap(headers);
  const shape = detectShape(map);
  const errors: string[] = [];
  const items: (ImportedTrade | ImportedFill)[] = [];
  let skipped = 0;
  const order = opts.dateOrder ?? "MDY";
  const feeFor = (sym: string) => (typeof opts.feePerContract === "function" ? opts.feePerContract(sym) : opts.feePerContract ?? 0);

  data.forEach((row, n) => {
    const line = n + 2;
    const symbol = (cell(row, map.symbol) ?? "").trim();
    const qty = Math.abs(parseNumber(cell(row, map.qty)) ?? NaN);
    const account = cell(row, map.account)?.trim() || null;
    // Some exports split costs into Fees + Commissions (e.g. TopstepX) — both reduce net P&L.
    const feeParts = [parseNumber(cell(row, map.fees)), parseNumber(cell(row, map.commissions))].filter((x): x is number => x !== null);
    const feeCell = feeParts.length ? feeParts.reduce((a, b) => a + Math.abs(b), 0) : null;
    if (!symbol || !Number.isFinite(qty) || qty <= 0) {
      skipped++;
      return;
    }
    const status = cell(row, map.status)?.toLowerCase();
    if (status && /cancel|reject|working|pending/.test(status)) {
      skipped++;
      return;
    }

    if (shape === "tradovate-performance" || shape === "round-trips") {
      let entryTime: string | null, exitTime: string | null, entryPrice: number | null, exitPrice: number | null;
      let direction: "long" | "short" | null;
      if (shape === "tradovate-performance") {
        const bt = parseDateTime(cell(row, map.buyTime), opts.tz, order);
        const st = parseDateTime(cell(row, map.sellTime), opts.tz, order);
        const bp = parseNumber(cell(row, map.buyPrice));
        const sp = parseNumber(cell(row, map.sellPrice));
        if (!bt || !st || bp === null || sp === null) {
          skipped++;
          if (errors.length < 5) errors.push(`Row ${line}: couldn't read the buy/sell times or prices.`);
          return;
        }
        direction = bt <= st ? "long" : "short";
        [entryTime, exitTime] = direction === "long" ? [bt, st] : [st, bt];
        [entryPrice, exitPrice] = direction === "long" ? [bp, sp] : [sp, bp];
      } else {
        entryTime = parseDateTime(cell(row, map.entryTime), opts.tz, order);
        exitTime = parseDateTime(cell(row, map.exitTime), opts.tz, order);
        entryPrice = parseNumber(cell(row, map.entryPrice));
        exitPrice = parseNumber(cell(row, map.exitPrice));
        direction = directionFrom(cell(row, map.direction));
        if (!entryTime || !exitTime || entryPrice === null || exitPrice === null) {
          skipped++;
          if (errors.length < 5) errors.push(`Row ${line}: couldn't read the entry/exit times or prices.`);
          return;
        }
        if (!direction) {
          // Infer from P&L sign when the export has no side column.
          const pnl = parseNumber(cell(row, map.pnl));
          if (pnl !== null && exitPrice !== entryPrice) direction = (pnl >= 0) === (exitPrice > entryPrice) ? "long" : "short";
          else direction = "long";
        }
      }
      const pnl = parseNumber(cell(row, map.pnl));
      const id = cell(row, map.id)?.trim();
      items.push({
        kind: "trade",
        key: id ? `id:${id}` : shape === "tradovate-performance" ? `row:${row.join("|")}` : `${symbol}|${entryTime}|${exitTime}|${qty}|${entryPrice}|${exitPrice}`,
        symbol,
        direction,
        qty,
        entryTime,
        exitTime,
        entryPrice,
        exitPrice,
        grossPnl: pnl,
        fees: feeCell !== null ? Math.abs(feeCell) : Math.round(feeFor(symbol) * qty * 100) / 100,
        account,
      });
      return;
    }

    if (shape === "fills") {
      const time = parseDateTime(cell(row, map.time ?? map.entryTime), opts.tz, order);
      const side = parseSide(cell(row, map.side ?? map.direction));
      const price = parseNumber(cell(row, map.price));
      if (!time || !side || price === null) {
        skipped++;
        if (errors.length < 5) errors.push(`Row ${line}: couldn't read the time, side or price.`);
        return;
      }
      const id = cell(row, map.id)?.trim();
      items.push({
        kind: "fill",
        key: id ? `id:${id}` : `${symbol}|${time}|${side}|${qty}|${price}|${line}`,
        symbol,
        side,
        qty,
        price,
        time,
        fees: feeCell !== null ? Math.abs(feeCell) : Math.round((feeFor(symbol) / 2) * qty * 100) / 100,
        account,
      });
      return;
    }
    skipped++;
  });

  if (shape === "unknown") errors.unshift("Couldn't recognise the columns. Map them below.");
  return { shape, items, skipped, errors };
}

export const MAPPABLE_FIELDS: { field: Field; label: string; shapes: Shape[] }[] = [
  { field: "symbol", label: "Symbol / contract", shapes: ["round-trips", "fills", "tradovate-performance"] },
  { field: "qty", label: "Quantity", shapes: ["round-trips", "fills", "tradovate-performance"] },
  { field: "entryTime", label: "Entry time", shapes: ["round-trips"] },
  { field: "exitTime", label: "Exit time", shapes: ["round-trips"] },
  { field: "entryPrice", label: "Entry price", shapes: ["round-trips"] },
  { field: "exitPrice", label: "Exit price", shapes: ["round-trips"] },
  { field: "direction", label: "Long / short", shapes: ["round-trips"] },
  { field: "time", label: "Fill time", shapes: ["fills"] },
  { field: "side", label: "Buy / sell", shapes: ["fills"] },
  { field: "price", label: "Fill price", shapes: ["fills"] },
  { field: "pnl", label: "P&L", shapes: ["round-trips", "tradovate-performance"] },
  { field: "fees", label: "Fees", shapes: ["round-trips", "fills", "tradovate-performance"] },
  { field: "commissions", label: "Commissions", shapes: ["round-trips", "fills", "tradovate-performance"] },
  { field: "account", label: "Account", shapes: ["round-trips", "fills", "tradovate-performance"] },
  { field: "id", label: "Trade / fill ID", shapes: ["round-trips", "fills", "tradovate-performance"] },
];
