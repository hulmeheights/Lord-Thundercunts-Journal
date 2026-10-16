/**
 * Pure helpers for the NinjaTrader / Tradovate MCP connection ("Log in with
 * Tradovate"). The MCP server is in beta and its tool output isn't a fixed
 * schema, so these read it defensively: any JSON array of account-like or
 * fill-like objects, wherever it sits in the result. No I/O here, so it's tested.
 */
import { pointValueFor, rootFromSymbol } from "./contracts";
import type { NormalizedFill } from "./roundtrip";
import type { BrokerAccountInfo } from "./types";

export type NtEnv = "demo" | "live";

export const NT_HOSTS: Record<NtEnv, { auth: string; api: string; mcp: string }> = {
  demo: { auth: "https://web.ninjatrader.com/oauth?env=demo", api: "https://demo.tradovateapi.com", mcp: "https://mcp-demo.tradovateapi.com/mcp" },
  live: { auth: "https://web.ninjatrader.com/oauth?env=live", api: "https://live.tradovateapi.com", mcp: "https://mcp-live.tradovateapi.com/mcp" },
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** The first key (case-insensitive) that holds a usable value. */
function pick(o: Obj, keys: string[]): unknown {
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase(), k]));
  for (const k of keys) {
    const real = lower.get(k.toLowerCase());
    if (real !== undefined && o[real] !== null && o[real] !== undefined && o[real] !== "") return o[real];
  }
  return undefined;
}
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[$,]/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);

/** MCP `tools/call` results put text in `content[]`; the text is usually JSON, sometimes JSON inside prose. */
export function toolPayload(result: unknown): unknown[] {
  const out: unknown[] = [];
  if (isObj(result) && result.structuredContent !== undefined) out.push(result.structuredContent);
  const content = isObj(result) && Array.isArray(result.content) ? result.content : [];
  for (const c of content) {
    if (!isObj(c) || typeof c.text !== "string") continue;
    const t = c.text.trim();
    try {
      out.push(JSON.parse(t));
      continue;
    } catch {
      /* fall through */
    }
    const m = /[[{][\s\S]*[\]}]/.exec(t);
    if (m) {
      try {
        out.push(JSON.parse(m[0]));
      } catch {
        /* not JSON */
      }
    }
  }
  return out;
}

/** Every array of objects anywhere in a value (depth-limited). */
function arraysOf(v: unknown, depth = 0, acc: Obj[][] = []): Obj[][] {
  if (depth > 5) return acc;
  if (Array.isArray(v)) {
    const objs = v.filter(isObj);
    if (objs.length) acc.push(objs);
    for (const x of v) if (isObj(x) || Array.isArray(x)) arraysOf(x, depth + 1, acc);
  } else if (isObj(v)) {
    for (const x of Object.values(v)) arraysOf(x, depth + 1, acc);
  }
  return acc;
}

export function parseAccounts(payloads: unknown[]): BrokerAccountInfo[] {
  const seen = new Map<string, BrokerAccountInfo>();
  for (const arr of payloads.flatMap((p) => arraysOf(p))) {
    for (const o of arr) {
      const name = str(pick(o, ["name", "accountName", "nickname", "account"]));
      const id = str(pick(o, ["id", "accountId", "accountSpec"])) ?? name;
      if (!id || !name) continue;
      // An account row has a name and either a balance or an account-ish id; skip positions, fills, etc.
      if (pick(o, ["price", "fillPrice", "qty", "netPos"]) !== undefined) continue;
      const balance = num(pick(o, ["balance", "cashBalance", "netLiq", "netLiquidation", "totalCashValue", "amount"]));
      seen.set(id, { externalId: id, name, isSim: true, balance, active: pick(o, ["active"]) !== false && pick(o, ["archived", "closed"]) !== true });
    }
  }
  return [...seen.values()];
}

function side(v: unknown): "buy" | "sell" | null {
  const s = str(v)?.toLowerCase();
  if (!s) return null;
  if (s.startsWith("b") || s === "long") return "buy";
  if (s.startsWith("s") || s === "short") return "sell";
  return null;
}

/** Tradovate contract names look like "MNQZ6"; strip any exchange suffix ("MNQZ6.CME"). */
function cleanSymbol(s: string): string {
  return s.trim().toUpperCase().split(/[.\s:]/)[0]!;
}

export function parseFills(payloads: unknown[], ctx: { connectionId: string; accountKey: string }): NormalizedFill[] {
  const fills: NormalizedFill[] = [];
  const ids = new Set<string>();
  for (const arr of payloads.flatMap((p) => arraysOf(p))) {
    for (const o of arr) {
      const sd = side(pick(o, ["action", "side", "buySell", "direction"]));
      const qty = num(pick(o, ["qty", "quantity", "filledQty", "size"]));
      const price = num(pick(o, ["price", "fillPrice", "avgPrice"]));
      const sym = str(pick(o, ["contractName", "symbol", "contract", "instrument", "name"]));
      const tsRaw = str(pick(o, ["timestamp", "time", "fillTime", "tradeDate", "date"]));
      if (!sd || !qty || price === null || !sym || !tsRaw) continue;
      const t = new Date(tsRaw);
      if (Number.isNaN(t.getTime())) continue;
      const symbol = cleanSymbol(sym);
      const root = rootFromSymbol(symbol);
      const extId = str(pick(o, ["id", "fillId", "execId", "executionId"])) ?? `${t.getTime()}-${sd}-${qty}-${price}-${symbol}`;
      const id = `${ctx.connectionId}:${extId}`;
      if (ids.has(id)) continue;
      ids.add(id);
      const fee = num(pick(o, ["fees", "fee", "commission", "commissions"]));
      fills.push({
        id,
        provider: ctx.connectionId,
        accountId: `${ctx.connectionId}:${ctx.accountKey}`,
        contractId: symbol,
        symbol,
        side: sd,
        qty: Math.abs(qty),
        price,
        ts: t.toISOString(),
        fees: fee === null ? 0 : Math.abs(fee),
        brokerPnl: null,
        pointValue: num(pick(o, ["pointValue", "valuePerPoint", "multiplier"])) ?? pointValueFor(root) ?? 1,
      });
    }
  }
  return fills;
}

/** Choose the tool that lists accounts from whatever the server advertises. */
export function pickTool(names: string[], prefs: RegExp[]): string | null {
  for (const re of prefs) {
    const hit = names.find((n) => re.test(n));
    if (hit) return hit;
  }
  return null;
}

export const ACCOUNT_TOOLS = [/^(list_)?accounts?(_list)?$/i, /^my_accounts?$/i, /account/i, /^my_portfolio$/i, /portfolio/i];
export const FILL_TOOLS = [/^fill_history$/i, /fills?/i, /executions?/i];

/** Reads a Streamable HTTP reply: plain JSON, or SSE whose `data:` lines carry the JSON-RPC message. */
export function parseRpcBody(contentType: string, body: string, id: number): unknown {
  if (contentType.includes("text/event-stream")) {
    for (const block of body.split(/\r?\n\r?\n/)) {
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        const msg = JSON.parse(data) as Obj;
        if (msg.id === id) return msg;
      } catch {
        /* keep reading */
      }
    }
    return null;
  }
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
