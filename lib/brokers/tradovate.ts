import "server-only";
import { stableDeviceId } from "../crypto";
import { pointValueFor, rootFromSymbol } from "./contracts";
import type { NormalizedFill } from "./roundtrip";
import { BrokerError, sleep, type BrokerAccountInfo, type BrokerClient, type TokenCache } from "./types";

/**
 * Tradovate client — READ ONLY. Every request goes through an allowlist of
 * read endpoints; the client has no way to place, modify or cancel orders.
 */
const READ_ONLY_GET = new Set([
  "/auth/renewaccesstoken",
  "/account/list",
  "/fill/list",
  "/fillFee/list",
  "/order/list",
  "/contract/items",
  "/product/find",
]);
const READ_ONLY_POST = new Set(["/auth/accesstokenrequest"]);

const HOSTS = {
  live: "https://live.tradovateapi.com/v1",
  demo: "https://demo.tradovateapi.com/v1",
} as const;

export type TradovateCreds = {
  username: string;
  password: string;
  cid: string;
  sec: string;
  environment: "live" | "demo";
};

type TvAuth = {
  accessToken?: string;
  expirationTime?: string;
  errorText?: string;
  "p-ticket"?: string;
  "p-time"?: number;
  "p-captcha"?: boolean;
};
type TvAccount = { id: number; name: string; active?: boolean; archived?: boolean };
type TvFill = { id: number; orderId: number; contractId: number; timestamp: string; action: "Buy" | "Sell"; qty: number; price: number; active?: boolean };
type TvFee = { id: number; clearingFee?: number; exchangeFee?: number; nfaFee?: number; brokerageFee?: number; ipFee?: number; commission?: number; orderRoutingFee?: number };
type TvOrder = { id: number; accountId: number };
type TvContract = { id: number; name: string };

export class TradovateClient implements BrokerClient {
  private base: string;
  private token: string | null = null;

  constructor(private creds: TradovateCreds, private cache: TokenCache) {
    this.base = HOSTS[creds.environment] ?? HOSTS.live;
  }

  private async request<T>(method: "GET" | "POST", path: string, opts: { query?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
    const allowed = method === "GET" ? READ_ONLY_GET : READ_ONLY_POST;
    if (!allowed.has(path)) throw new BrokerError(`Blocked non read-only endpoint: ${method} ${path}`);
    const auth = opts.auth ?? true;
    for (let attempt = 0; attempt < 3; attempt++) {
      const headers: Record<string, string> = { accept: "application/json" };
      if (method === "POST") headers["content-type"] = "application/json";
      if (auth) headers.authorization = `Bearer ${await this.getToken()}`;
      let res: Response;
      try {
        res = await fetch(`${this.base}${path}${opts.query ? `?${opts.query}` : ""}`, {
          method,
          headers,
          body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        if (attempt < 2) { await sleep(1000 * (attempt + 1)); continue; }
        throw new BrokerError("Couldn't reach Tradovate. Try again shortly.");
      }
      if (res.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
      if (res.status === 401 && auth && attempt === 0) {
        this.token = null;
        await this.cache.clear();
        continue;
      }
      if (!res.ok) throw new BrokerError(`Tradovate request failed (HTTP ${res.status}).`);
      return (await res.json()) as T;
    }
    throw new BrokerError("Tradovate is rate limiting requests — try again in a minute.");
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const cached = await this.cache.get();
    if (cached) {
      const left = cached.expiresAt.getTime() - Date.now();
      if (left > 15 * 60_000) {
        this.token = cached.token;
        return cached.token;
      }
      if (left > 60_000) {
        // Renew instead of opening a new session (Tradovate limits logins).
        this.token = cached.token;
        try {
          const r = await this.request<TvAuth>("GET", "/auth/renewaccesstoken");
          if (r.accessToken && r.expirationTime) {
            this.token = r.accessToken;
            await this.cache.set(r.accessToken, new Date(r.expirationTime));
            return r.accessToken;
          }
        } catch {
          // fall through to a fresh login
        }
        this.token = null;
      }
    }
    return this.login();
  }

  private async login(ticket?: string): Promise<string> {
    const cidNum = /^\d+$/.test(this.creds.cid) ? Number(this.creds.cid) : this.creds.cid;
    const body: Record<string, unknown> = {
      name: this.creds.username,
      password: this.creds.password,
      appId: "LordThundercuntsJournal",
      appVersion: "1.0",
      deviceId: stableDeviceId("tradovate"),
      cid: cidNum,
      sec: this.creds.sec,
    };
    if (ticket) body["p-ticket"] = ticket;
    const r = await this.request<TvAuth>("POST", "/auth/accesstokenrequest", { body, auth: false });
    if (r["p-ticket"]) {
      if (r["p-captcha"]) {
        throw new BrokerError("Tradovate paused API logins (captcha required). Log in on tradovate.com, wait about an hour, then sync again.");
      }
      const wait = Number(r["p-time"] ?? 0);
      if (!ticket && wait > 0 && wait <= 15) {
        await sleep(wait * 1000);
        return this.login(r["p-ticket"]);
      }
      throw new BrokerError(`Tradovate asked us to wait ${wait || "a few"} seconds before logging in again.`);
    }
    if (r.errorText || !r.accessToken) {
      throw new BrokerError(`Tradovate login failed: ${r.errorText || "check your credentials and API key"}`);
    }
    this.token = r.accessToken;
    await this.cache.set(r.accessToken, r.expirationTime ? new Date(r.expirationTime) : new Date(Date.now() + 80 * 60_000));
    return r.accessToken;
  }

  async listAccounts(): Promise<BrokerAccountInfo[]> {
    const rows = await this.request<TvAccount[]>("GET", "/account/list");
    return rows.map((a) => ({
      externalId: String(a.id),
      name: a.name,
      isSim: this.creds.environment === "demo",
      balance: null,
      active: a.active !== false && a.archived !== true,
    }));
  }

  async listFills(accounts: BrokerAccountInfo[], since: Date): Promise<NormalizedFill[]> {
    const [fills, fees, orders] = await Promise.all([
      this.request<TvFill[]>("GET", "/fill/list"),
      this.request<TvFee[]>("GET", "/fillFee/list"),
      this.request<TvOrder[]>("GET", "/order/list"),
    ]);
    const wanted = new Set(accounts.map((a) => a.externalId));
    const orderAccount = new Map(orders.map((o) => [o.id, String(o.accountId)]));
    const feeById = new Map(
      fees.map((f) => [
        f.id,
        (f.clearingFee ?? 0) + (f.exchangeFee ?? 0) + (f.nfaFee ?? 0) + (f.brokerageFee ?? 0) + (f.ipFee ?? 0) + (f.commission ?? 0) + (f.orderRoutingFee ?? 0),
      ]),
    );

    const relevant = fills.filter((f) => f.active !== false && new Date(f.timestamp) >= since);
    const contractIds = [...new Set(relevant.map((f) => f.contractId))];
    const contractName = new Map<number, string>();
    for (let i = 0; i < contractIds.length; i += 50) {
      const ids = contractIds.slice(i, i + 50).join(",");
      const rows = await this.request<TvContract[]>("GET", "/contract/items", { query: `ids=${ids}` });
      rows.forEach((c) => contractName.set(c.id, c.name));
    }
    const pointValue = new Map<string, number>();
    for (const name of new Set(contractName.values())) {
      const root = rootFromSymbol(name);
      if (pointValue.has(root)) continue;
      let pv = pointValueFor(root);
      try {
        const p = await this.request<{ valuePerPoint?: number }>("GET", "/product/find", { query: `name=${encodeURIComponent(root)}` });
        if (p && typeof p.valuePerPoint === "number" && p.valuePerPoint > 0) pv = p.valuePerPoint;
      } catch {
        // keep table value
      }
      pointValue.set(root, pv ?? 1);
    }

    const single = accounts.length === 1 ? accounts[0]!.externalId : null;
    const out: NormalizedFill[] = [];
    for (const f of relevant) {
      const acct = orderAccount.get(f.orderId) ?? single;
      if (!acct || !wanted.has(acct)) continue;
      const name = contractName.get(f.contractId) ?? String(f.contractId);
      out.push({
        id: `tradovate:${f.id}`,
        provider: "tradovate",
        accountId: `tradovate:${acct}`,
        contractId: String(f.contractId),
        symbol: name,
        side: f.action === "Buy" ? "buy" : "sell",
        qty: f.qty,
        price: f.price,
        ts: new Date(f.timestamp).toISOString(),
        fees: feeById.get(f.id) ?? 0,
        brokerPnl: null,
        pointValue: pointValue.get(rootFromSymbol(name)) ?? 1,
      });
    }
    return out;
  }
}
