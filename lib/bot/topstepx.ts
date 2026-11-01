import "server-only";
import { BrokerError } from "../brokers/types";

/**
 * Autopilot's TopstepX (ProjectX Gateway) client: READ ONLY. It can list your
 * accounts and balances, find the MNQ contract and see open positions, which is
 * all the website needs to decide. It can't place, cancel or change anything:
 * Topstep requires orders to come from your own computer, so the runner on
 * your Mac places them. Every call must be in ALLOWED.
 * Credentials come from the server's environment (BOT_TOPSTEP_USERNAME and
 * BOT_TOPSTEP_API_KEY, or the old bot's TOPSTEP_* names), never from the
 * browser or the database.
 */
const HOST = "https://api.topstepx.com";
const ALLOWED = new Set(["/api/Auth/loginKey", "/api/Account/search", "/api/Contract/search", "/api/Position/searchOpen"]);

let cached: { token: string; at: number } | null = null;

// The same names as the old mnq-bot work too, so its values can be copied across as they are.
export const botCreds = () => ({
  userName: (process.env.BOT_TOPSTEP_USERNAME || process.env.TOPSTEP_USERNAME || "").trim(),
  apiKey: (process.env.BOT_TOPSTEP_API_KEY || process.env.TOPSTEP_API_KEY || "").trim(),
});
export const botConfigured = () => !!(botCreds().userName && botCreds().apiKey);

async function call<T>(path: string, body: unknown, token?: string): Promise<T> {
  if (!ALLOWED.has(path)) throw new BrokerError(`Blocked: ${path} isn't something Autopilot is allowed to call`);
  const r = await fetch(HOST + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const data = (await r.json().catch(() => ({}))) as T & { success?: boolean; errorMessage?: string | null; errorCode?: number };
  if (!r.ok || data.success === false) throw new BrokerError(`${path.split("/").pop()} failed (${r.status}${data.errorMessage ? `: ${data.errorMessage}` : data.errorCode ? `, code ${data.errorCode}` : ""})`);
  return data;
}

export async function token(): Promise<string> {
  if (cached && Date.now() - cached.at < 20 * 60_000) return cached.token;
  const { userName, apiKey } = botCreds();
  if (!userName || !apiKey) throw new BrokerError("Autopilot isn't connected: BOT_TOPSTEP_USERNAME and BOT_TOPSTEP_API_KEY aren't set");
  const d = await call<{ token: string }>("/api/Auth/loginKey", { userName, apiKey });
  cached = { token: d.token, at: Date.now() };
  return d.token;
}

export type TsxAccount = { id: number; name: string; balance?: number; canTrade?: boolean; simulated?: boolean };
export async function accounts(t: string): Promise<TsxAccount[]> {
  return (await call<{ accounts?: TsxAccount[] }>("/api/Account/search", { onlyActiveAccounts: true }, t)).accounts ?? [];
}

/** The account a card names: by id, or by name (exact first, then contains). */
export function matchAccount(list: TsxAccount[], hint: string): TsxAccount | null {
  const h = hint.trim().toLowerCase();
  if (!h) return null;
  return list.find((a) => String(a.id) === h) ?? list.find((a) => a.name.toLowerCase() === h) ?? list.find((a) => a.name.toLowerCase().includes(h)) ?? null;
}

type Contract = { id: string; name: string; activeContract?: boolean };
let contractCache: { c: Contract; at: number } | null = null;
/** The front-month MNQ contract (remembered for an hour, so an entry doesn't wait for it). */
export async function mnq(t: string): Promise<Contract> {
  if (contractCache && Date.now() - contractCache.at < 60 * 60_000) return contractCache.c;
  const c = await findMnq(t);
  contractCache = { c, at: Date.now() };
  return c;
}
async function findMnq(t: string): Promise<Contract> {
  const list = (await call<{ contracts?: Contract[] }>("/api/Contract/search", { searchText: "MNQ", live: false }, t)).contracts ?? [];
  const pick = list.find((c) => /^MNQ/i.test(c.name) && c.activeContract !== false) ?? list.find((c) => /^MNQ/i.test(c.name));
  if (!pick) throw new BrokerError("No MNQ contract found");
  return pick;
}

/** Open positions on an account (read only): used to make sure an account is flat before a new entry. */
export async function openPositions(t: string, accountId: number): Promise<{ contractId: string; type: number; size: number }[]> {
  return (await call<{ positions?: { contractId: string; type: number; size: number }[] }>("/api/Position/searchOpen", { accountId }, t)).positions ?? [];
}
