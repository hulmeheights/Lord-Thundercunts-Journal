import "server-only";
import { sha256 } from "../crypto";
import { parseProjectXContractId, pointValueFor } from "./contracts";
import type { BuiltTrade } from "./roundtrip";
import { BrokerError, sleep, type BrokerAccountInfo, type BrokerClient } from "./types";

/**
 * FREE, credential-less TopstepX sync via the Performance Stats "Share" link.
 *
 * When you switch on sharing for an account in TopstepX, Topstep publishes that
 * account's stats at topstepx.com/share/stats?share=<accountId>. The same public
 * JSON powers this client — no username, password or API key is ever needed.
 * It's undocumented, so every response is parsed defensively.
 */
const HOST = "https://userapi.topstepx.com";
const READ_ONLY = new Set(["GET /Statistics/checkSharing", "GET /Statistics/getAccountName", "POST /Trade/range", "POST /Statistics/todaystats"]);

export type ShareCreds = { accountIds: number[] };

/** Accepts a share link, or a bare account number. */
export function parseShareInput(input: string): number[] {
  const ids = new Set<number>();
  for (const part of input.split(/[\s,]+/)) {
    const m = /[?&]share=(\d{4,12})/.exec(part) ?? /^(\d{4,12})$/.exec(part.trim());
    if (m) ids.add(Number(m[1]));
  }
  return [...ids];
}

type ShareTrade = {
  id?: number | string;
  symbolId?: string;
  contractId?: string;
  contractDisplayName?: string;
  createdAt?: string;
  exitedAt?: string | null;
  positionSize?: number;
  entryPrice?: number;
  exitPrice?: number | null;
  pnL?: number | null;
  fees?: number | null;
  commissions?: number | null;
  voided?: boolean;
};

const PROJECTX_ROOT: Record<string, string> = { EP: "ES", ENQ: "NQ", CLE: "CL", MCLE: "MCL", GCE: "GC", MGCE: "MGC", SIE: "SI", HGE: "HG", NGE: "NG" };

function symbolFor(t: ShareTrade): { symbol: string; root: string } {
  if (t.contractId?.startsWith("CON.")) {
    const p = parseProjectXContractId(t.contractId);
    return { symbol: t.contractDisplayName || p.symbol, root: p.root };
  }
  const raw = (t.symbolId ?? "").split(".").pop() || t.contractDisplayName || "UNKNOWN";
  const root = PROJECTX_ROOT[raw] ?? raw;
  return { symbol: t.contractDisplayName || root, root };
}

export class TopstepShareClient implements BrokerClient {
  constructor(private creds: ShareCreds, private connectionId = "topstepx-share") {}

  private async call<T>(method: "GET" | "POST", path: string, opts: { query?: string; body?: unknown } = {}): Promise<T> {
    if (!READ_ONLY.has(`${method} ${path}`)) throw new BrokerError(`Blocked endpoint: ${method} ${path}`);
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${HOST}${path}${opts.query ? `?${opts.query}` : ""}`, {
          method,
          headers: { accept: "application/json", ...(method === "POST" ? { "content-type": "application/json" } : {}) },
          body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        if (attempt < 2) { await sleep(1500 * (attempt + 1)); continue; }
        throw new BrokerError("Couldn't reach TopstepX. Try again shortly.");
      }
      if (res.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
      if (!res.ok) throw new BrokerError(`TopstepX share link request failed (HTTP ${res.status}).`);
      const text = await res.text();
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }
    throw new BrokerError("TopstepX is rate limiting — try again in a minute.");
  }

  async listAccounts(): Promise<BrokerAccountInfo[]> {
    const out: BrokerAccountInfo[] = [];
    for (const id of this.creds.accountIds) {
      const sharing = await this.call<unknown>("GET", "/Statistics/checkSharing", { query: `tradingAccountId=${id}` });
      if (sharing !== true && sharing !== "true") {
        throw new BrokerError(`Sharing is switched off for account ${id}. In TopstepX open Performance stats → Share, then try again.`);
      }
      let name = `TopstepX ${id}`;
      try {
        const n = await this.call<unknown>("GET", "/Statistics/getAccountName", { query: `tradingAccountId=${id}` });
        if (typeof n === "string" && n.trim()) name = n.trim().replace(/^"|"$/g, "");
      } catch {
        /* keep default */
      }
      let balance: number | null = null;
      try {
        const s = await this.call<{ balance?: number }[]>("POST", "/Statistics/todaystats", { query: `accountId=${id}`, body: {} });
        if (Array.isArray(s) && typeof s[0]?.balance === "number") balance = s[0].balance;
      } catch {
        /* optional */
      }
      out.push({ externalId: String(id), name, isSim: true, balance, active: true });
    }
    return out;
  }

  async listFills(): Promise<never[]> {
    return [];
  }

  /** Round trips straight from TopstepX (gross P&L, fees and commissions included). */
  async listTrades(accounts: BrokerAccountInfo[], since: Date): Promise<BuiltTrade[]> {
    const out: BuiltTrade[] = [];
    const end = Date.now() + 86_400_000;
    const CHUNK = 30 * 86_400_000;
    for (const acc of accounts) {
      const accountId = `${this.connectionId}:${acc.externalId}`;
      for (let from = since.getTime(); from < end; from += CHUNK) {
        const rows = await this.call<ShareTrade[]>("POST", "/Trade/range", {
          body: { tradingAccountId: Number(acc.externalId), start: new Date(from).toISOString(), end: new Date(Math.min(from + CHUNK, end)).toISOString() },
        });
        if (!Array.isArray(rows)) continue;
        for (const t of rows) {
          if (t.voided || t.exitPrice == null || !t.exitedAt || !t.createdAt || typeof t.entryPrice !== "number") continue;
          const qty = Math.abs(Number(t.positionSize ?? 0));
          if (!(qty > 0)) continue;
          const gross = typeof t.pnL === "number" ? t.pnL : null;
          const move = t.exitPrice - t.entryPrice;
          // Direction from price move vs P&L sign; only if flat, fall back to the sign convention (negative = long).
          const direction: "long" | "short" =
            gross !== null && gross !== 0 && move !== 0 ? ((gross > 0) === (move > 0) ? "long" : "short") : Number(t.positionSize) < 0 ? "long" : "short";
          const { symbol, root } = symbolFor(t);
          const pv = gross !== null && move !== 0 ? Math.abs(gross / (move * qty)) : pointValueFor(root) ?? 1;
          const grossPnl = gross ?? Math.round((direction === "long" ? move : -move) * qty * pv * 100) / 100;
          const fees = Math.abs(Number(t.fees ?? 0)) + Math.abs(Number(t.commissions ?? 0));
          const key = t.id != null ? String(t.id) : sha256(`${t.createdAt}|${t.exitedAt}|${t.entryPrice}|${t.exitPrice}|${t.positionSize}`).slice(0, 20);
          out.push({
            id: `${this.connectionId}:${acc.externalId}:${key}`,
            source: this.connectionId,
            accountId,
            symbol,
            root,
            direction,
            qty,
            maxPosition: qty,
            entryTime: new Date(t.createdAt).toISOString(),
            exitTime: new Date(t.exitedAt).toISOString(),
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice,
            grossPnl: Math.round(grossPnl * 100) / 100,
            fees: Math.round(fees * 100) / 100,
            netPnl: Math.round((grossPnl - fees) * 100) / 100,
            pointValue: Math.round(pv * 1e6) / 1e6,
            fillCount: 2,
          });
        }
      }
    }
    return out;
  }
}
