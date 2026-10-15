import "server-only";
import { parseProjectXContractId, pointValueFor } from "./contracts";
import type { NormalizedFill } from "./roundtrip";
import { BrokerError, sleep, type BrokerAccountInfo, type BrokerClient, type TokenCache } from "./types";

/**
 * TopstepX / ProjectX Gateway client — READ ONLY.
 *
 * A ProjectX API key carries full trading permissions, so this client
 * enforces read-only access in code: it can only ever call the endpoints in
 * READ_ONLY_PATHS. There is no code path that can place, modify or cancel an
 * order, flatten a position or touch account settings.
 */
const READ_ONLY_PATHS = new Set([
  "/api/Auth/loginKey",
  "/api/Account/search",
  "/api/Trade/search",
  "/api/Contract/searchById",
]);

export const DEFAULT_PROJECTX_HOST = "https://api.topstepx.com";

export type ProjectXCreds = { userName: string; apiKey: string; host?: string };

/** Only HTTPS ProjectX gateway hosts are allowed (prevents sending keys anywhere else). */
export function validateProjectXHost(input: string | undefined): string {
  const raw = (input || DEFAULT_PROJECTX_HOST).trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BrokerError("Invalid API host");
  }
  const okHost = url.hostname === "api.topstepx.com" || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.projectx\.com$/.test(url.hostname);
  if (url.protocol !== "https:" || !okHost || url.pathname !== "/" || url.port) {
    throw new BrokerError("API host must be https://api.topstepx.com or another https://…projectx.com gateway");
  }
  return `https://${url.hostname}`;
}

type PxAccount = { id: number; name: string; balance?: number; canTrade?: boolean; isVisible?: boolean; simulated?: boolean };
type PxTrade = {
  id: number;
  accountId: number;
  contractId: string;
  creationTimestamp: string;
  price: number;
  profitAndLoss: number | null;
  fees: number | null;
  side: number; // 0 = buy (bid), 1 = sell (ask)
  size: number;
  voided: boolean;
  orderId: number;
};
type PxContract = { id: string; name: string; tickSize: number; tickValue: number };

export class ProjectXClient implements BrokerClient {
  private host: string;
  private token: string | null = null;
  private contracts = new Map<string, { symbol: string; pointValue: number }>();

  constructor(private creds: ProjectXCreds, private cache: TokenCache) {
    this.host = validateProjectXHost(creds.host);
  }

  private async post<T>(path: string, body: unknown, auth = true): Promise<T> {
    if (!READ_ONLY_PATHS.has(path)) throw new BrokerError(`Blocked non read-only endpoint: ${path}`);
    for (let attempt = 0; attempt < 4; attempt++) {
      const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
      if (auth) headers.authorization = `Bearer ${await this.getToken()}`;
      let res: Response;
      try {
        res = await fetch(`${this.host}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        if (attempt < 2) { await sleep(1000 * (attempt + 1)); continue; }
        throw new BrokerError("Couldn't reach TopstepX. Try again shortly.");
      }
      if (res.status === 429) { await sleep(2500 * (attempt + 1)); continue; }
      if (res.status === 401 && auth && attempt === 0) {
        this.token = null;
        await this.cache.clear();
        continue;
      }
      if (!res.ok) throw new BrokerError(`TopstepX request failed (HTTP ${res.status}).`);
      const json = (await res.json()) as T & { success?: boolean; errorCode?: number; errorMessage?: string | null };
      if (json && json.success === false) {
        if (path === "/api/Auth/loginKey") {
          throw new BrokerError(
            "TopstepX rejected that username or API key. Use your TopstepX username (not email), and check your ProjectX API subscription is linked under Settings → API.",
          );
        }
        throw new BrokerError(`TopstepX: ${json.errorMessage || `error code ${json.errorCode}`}`);
      }
      return json;
    }
    throw new BrokerError("TopstepX is rate limiting requests — try again in a minute.");
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const cached = await this.cache.get();
    if (cached && cached.expiresAt.getTime() - Date.now() > 30 * 60_000) {
      this.token = cached.token;
      return cached.token;
    }
    const json = await this.post<{ token: string | null }>(
      "/api/Auth/loginKey",
      { userName: this.creds.userName, apiKey: this.creds.apiKey },
      false,
    );
    if (!json.token) throw new BrokerError("TopstepX login failed — check your username and API key.");
    this.token = json.token;
    await this.cache.set(json.token, new Date(Date.now() + 23 * 60 * 60_000));
    return json.token;
  }

  async listAccounts(): Promise<BrokerAccountInfo[]> {
    const json = await this.post<{ accounts: PxAccount[] }>("/api/Account/search", { onlyActiveAccounts: false });
    return (json.accounts ?? []).map((a) => ({
      externalId: String(a.id),
      name: a.name,
      isSim: a.simulated ?? true,
      balance: typeof a.balance === "number" ? a.balance : null,
      active: a.canTrade !== false,
    }));
  }

  private async contract(id: string): Promise<{ symbol: string; pointValue: number }> {
    const hit = this.contracts.get(id);
    if (hit) return hit;
    const parsed = parseProjectXContractId(id);
    let info = { symbol: parsed.symbol, pointValue: pointValueFor(parsed.root) ?? 1 };
    try {
      const json = await this.post<{ contract: PxContract | null }>("/api/Contract/searchById", { contractId: id });
      const c = json.contract;
      if (c && c.tickSize > 0 && c.tickValue > 0) info = { symbol: c.name || parsed.symbol, pointValue: c.tickValue / c.tickSize };
    } catch {
      // Expired contracts may not resolve — fall back to the static table.
    }
    this.contracts.set(id, info);
    return info;
  }

  async listFills(accounts: BrokerAccountInfo[], since: Date): Promise<NormalizedFill[]> {
    const out: NormalizedFill[] = [];
    const end = new Date();
    const CHUNK = 30 * 86_400_000;
    for (const acc of accounts) {
      for (let from = since.getTime(); from < end.getTime(); from += CHUNK) {
        const to = Math.min(from + CHUNK, end.getTime());
        const json = await this.post<{ trades: PxTrade[] }>("/api/Trade/search", {
          accountId: Number(acc.externalId),
          startTimestamp: new Date(from).toISOString(),
          endTimestamp: new Date(to).toISOString(),
        });
        for (const t of json.trades ?? []) {
          if (t.voided || !(t.size > 0)) continue;
          const c = await this.contract(t.contractId);
          out.push({
            id: `topstepx:${t.id}`,
            provider: "topstepx",
            accountId: `topstepx:${acc.externalId}`,
            contractId: t.contractId,
            symbol: c.symbol,
            side: t.side === 0 ? "buy" : "sell",
            qty: t.size,
            price: t.price,
            ts: new Date(t.creationTimestamp).toISOString(),
            fees: t.fees ?? 0,
            brokerPnl: t.profitAndLoss ?? null,
            pointValue: c.pointValue,
          });
        }
      }
    }
    return out;
  }
}
