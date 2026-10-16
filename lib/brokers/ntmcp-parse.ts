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

/**
 * Tradovate's own sign-in page (trader.tradovate.com, the one Tradecopia uses) accepts
 * the same self-registered client as NinjaTrader's, so that's where we send you.
 */
export const TRADOVATE_SIGN_IN = "https://trader.tradovate.com/oauth";

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

/**
 * The ONLY tools the journal may ever call, by exact name. Each one reads history
 * or balances. Anything not on this list (placing, changing, cancelling or closing
 * orders, positions, alerts, risk settings, accounts) is refused before a request
 * is made, whatever the server offers. An unknown name fails safe: no sync, no call.
 */
export const READ_TOOLS = {
  accounts: ["list_accounts", "accounts", "get_accounts", "my_accounts", "account_list", "my_portfolio"],
  fills: ["fill_history"],
} as const;
export const ACCOUNT_TOOLS = READ_TOOLS.accounts;
export const FILL_TOOLS = READ_TOOLS.fills;
const ALLOWED = new Set<string>([...READ_TOOLS.accounts, ...READ_TOOLS.fills]);
/** Second, independent check: no allowed name may even contain a word that acts on an account. */
const WRITE = /(place|cancel|modify|replace|close|liquidat|flatten|submit|exit|bracket|oco|transfer|withdraw|deposit|set|update|create|delete|start|stop|reset|risk|alert|order)/i;
export const isReadTool = (name: string) => ALLOWED.has(name) && !WRITE.test(name);

/** The first allowed tool, in our order of preference, that the server actually offers. */
export function pickTool(offered: string[], preferred: readonly string[]): string | null {
  const have = new Set(offered);
  return preferred.find((n) => have.has(n) && isReadTool(n)) ?? null;
}

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

/**
 * Tradovate only lets this sign-in return to a loopback address, so the browser
 * lands on a page that can't load with the code in its address bar. This reads
 * the code and state back out of whatever gets pasted: the whole address, the
 * part after "?", or the bare code.
 */
export const LOOPBACK_REDIRECT = "http://localhost:8765/callback";

export function readPastedCallback(input: string): { code: string; state: string | null; error: string | null; reason?: string | null } | null {
  const raw = input.trim();
  if (!raw || raw.length > 4000) return null;
  let params: URLSearchParams | null = null;
  try {
    if (/^https?:\/\//i.test(raw)) params = new URL(raw).searchParams;
  } catch {
    /* not a URL */
  }
  if (!params && raw.includes("=")) params = new URLSearchParams(raw.replace(/^[^?]*\?/, ""));
  if (params) {
    const error = params.get("error");
    const code = params.get("code");
    if (error && !code) return { code: "", state: params.get("state"), error, reason: params.get("error_description") };
    return code ? { code, state: params.get("state"), error: null } : null;
  }
  // A bare code: no spaces, URL-safe characters only.
  return /^[\w.~-]{8,}$/.test(raw) ? { code: raw, state: null, error: null } : null;
}
