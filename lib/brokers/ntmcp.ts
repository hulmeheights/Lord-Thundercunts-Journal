import "server-only";
import { createHash } from "node:crypto";
import { db } from "../db";
import { encryptJson, randomToken } from "../crypto";
import type { NormalizedFill } from "./roundtrip";
import { BrokerError, type BrokerAccountInfo, type BrokerClient, type TokenCache } from "./types";
import { ACCOUNT_TOOLS, FILL_TOOLS, isReadTool, NT_HOSTS, parseAccounts, parseFills, parseRpcBody, pickTool, toolPayload, ymd, type NtEnv } from "./ntmcp-parse";

/**
 * "Log in with Tradovate": the same sign-in screen Tradecopia sends you to,
 * through NinjaTrader's self-service OAuth (MCP beta). No API add-on, no
 * password stored here. We only keep a rotating refresh token, encrypted,
 * and only ever call read tools (fill history, accounts).
 *
 * Flow: dynamic client registration (RFC 7591), then PKCE S256 authorisation
 * with `resource` set to the MCP endpoint on every token request (without it
 * the token has no audience and the MCP server answers 401).
 */

export type NtCreds = { env: NtEnv; clientId: string; refreshToken: string; refreshExpiresAt: string | null };
export type NtTokens = { accessToken: string; expiresAt: Date; refreshToken: string; refreshExpiresAt: Date | null };

const SCOPE = "mcp:connect";
const TIMEOUT = 20_000;

async function http(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store", redirect: "error" });
  } catch {
    throw new BrokerError("Couldn't reach Tradovate. Try again in a minute.");
  }
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function registerClient(env: NtEnv, redirectUri: string): Promise<string> {
  const res = await http(`${NT_HOSTS[env].api}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "Thundercunts Journal (read-only)",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SCOPE,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { client_id?: string };
  if (!res.ok || !json.client_id) throw new BrokerError("Tradovate didn't accept the app registration. The beta may be closed right now; use CSV import meanwhile.");
  return json.client_id;
}

export function authorizeUrl(a: { env: NtEnv; clientId: string; redirectUri: string; challenge: string; state: string }): string {
  const u = new URL(NT_HOSTS[a.env].auth);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", a.clientId);
  u.searchParams.set("redirect_uri", a.redirectUri);
  u.searchParams.set("code_challenge", a.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", a.state);
  u.searchParams.set("scope", SCOPE);
  u.searchParams.set("resource", NT_HOSTS[a.env].mcp);
  return u.toString();
}

async function tokenRequest(env: NtEnv, params: Record<string, string>): Promise<NtTokens> {
  const res = await http(`${NT_HOSTS[env].api}/auth/oauthtoken`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ ...params, resource: NT_HOSTS[env].mcp }).toString(),
  });
  const j = (await res.json().catch(() => ({}))) as {
    access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; error?: string;
  };
  if (!res.ok || !j.access_token) {
    throw new BrokerError(
      j.error === "invalid_grant" ? "Your Tradovate sign-in has expired. Log in with Tradovate again." : "Tradovate refused the sign-in. Log in with Tradovate again.",
    );
  }
  const now = Date.now();
  return {
    accessToken: j.access_token,
    expiresAt: new Date(now + Math.max(60, (j.expires_in ?? 3600) - 120) * 1000),
    refreshToken: j.refresh_token ?? params.refresh_token ?? "",
    refreshExpiresAt: j.refresh_token_expires_in ? new Date(now + j.refresh_token_expires_in * 1000) : null,
  };
}

export const exchangeCode = (env: NtEnv, a: { clientId: string; code: string; verifier: string; redirectUri: string }) =>
  tokenRequest(env, { grant_type: "authorization_code", client_id: a.clientId, code: a.code, code_verifier: a.verifier, redirect_uri: a.redirectUri });

/** Minimal Streamable-HTTP MCP client: initialize once, then JSON-RPC calls. */
class Mcp {
  private session: string | null = null;
  private seq = 0;
  private ready = false;
  constructor(private url: string, private token: () => Promise<string>) {}

  private async post(body: object, expectReply: boolean): Promise<unknown> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${await this.token()}`,
      "mcp-protocol-version": "2025-06-18",
    };
    if (this.session) headers["mcp-session-id"] = this.session;
    const res = await http(this.url, { method: "POST", headers, body: JSON.stringify(body) });
    if (res.status === 401 || res.status === 403) throw new BrokerError("Tradovate turned the sign-in down. Log in with Tradovate again.");
    if (!res.ok && res.status !== 202) throw new BrokerError(`Tradovate's read service answered ${res.status}. Try again shortly.`);
    this.session = res.headers.get("mcp-session-id") ?? this.session;
    if (!expectReply) return null;
    const msg = parseRpcBody(res.headers.get("content-type") ?? "", await res.text(), (body as { id: number }).id) as { result?: unknown; error?: { message?: string } } | null;
    if (!msg) throw new BrokerError("Tradovate sent an unreadable reply.");
    if (msg.error) throw new BrokerError("Tradovate couldn't read that history right now.");
    return msg.result;
  }

  private async init() {
    if (this.ready) return;
    await this.post({ jsonrpc: "2.0", id: ++this.seq, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "ltj", version: "1" } } }, true);
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, false);
    this.ready = true;
  }

  async tools(): Promise<string[]> {
    await this.init();
    const r = (await this.post({ jsonrpc: "2.0", id: ++this.seq, method: "tools/list", params: {} }, true)) as { tools?: { name: string }[] } | null;
    return (r?.tools ?? []).map((t) => t.name);
  }

  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    // Belt and braces: even a mis-picked name can never reach a tool that acts on the account.
    if (!isReadTool(name)) throw new BrokerError("Refused: the journal only reads from Tradovate.");
    await this.init();
    const r = (await this.post({ jsonrpc: "2.0", id: ++this.seq, method: "tools/call", params: { name, arguments: args } }, true)) as { isError?: boolean } | null;
    if (r?.isError) throw new BrokerError(`Tradovate couldn't run "${name}" right now.`);
    return r;
  }
}

export class NtMcpClient implements BrokerClient {
  private mcp: Mcp;
  private toolNames: string[] | null = null;
  constructor(
    private creds: NtCreds,
    private cache: TokenCache,
    private connectionId: string,
    /** The refresh token rotates on every use: persist the new one or the next sync can't sign in. */
    private onRotate: (c: NtCreds) => Promise<void>,
  ) {
    this.mcp = new Mcp(NT_HOSTS[creds.env].mcp, () => this.accessToken());
  }

  private async accessToken(): Promise<string> {
    const cached = await this.cache.get();
    if (cached && cached.expiresAt.getTime() > Date.now() + 30_000) return cached.token;
    const t = await tokenRequest(this.creds.env, { grant_type: "refresh_token", client_id: this.creds.clientId, refresh_token: this.creds.refreshToken });
    this.creds = { ...this.creds, refreshToken: t.refreshToken, refreshExpiresAt: t.refreshExpiresAt?.toISOString() ?? this.creds.refreshExpiresAt };
    await this.onRotate(this.creds);
    await this.cache.set(t.accessToken, t.expiresAt);
    return t.accessToken;
  }

  private async names() {
    return (this.toolNames ??= await this.mcp.tools());
  }

  async listAccounts(): Promise<BrokerAccountInfo[]> {
    const tool = pickTool(await this.names(), ACCOUNT_TOOLS);
    if (!tool) throw new BrokerError("Tradovate's read service doesn't list accounts yet. Use CSV import for now.");
    const accounts = parseAccounts(toolPayload(await this.mcp.call(tool, { format: "json" })));
    if (!accounts.length) throw new BrokerError("Signed in, but no accounts came back. Tick the View permissions when you log in.");
    return accounts;
  }

  async listFills(accounts: BrokerAccountInfo[], since: Date): Promise<NormalizedFill[]> {
    const tool = pickTool(await this.names(), FILL_TOOLS);
    if (!tool) throw new BrokerError("Tradovate's read service doesn't offer fill history yet. Use CSV import for now.");
    const out: NormalizedFill[] = [];
    for (const a of accounts) {
      const result = await this.mcp.call(tool, { account: a.name, startDate: ymd(since), endDate: ymd(new Date(Date.now() + 86_400_000)), format: "json" });
      out.push(...parseFills(toolPayload(result), { connectionId: this.connectionId, accountKey: a.externalId }));
    }
    return out;
  }
}

/** Saves (or refreshes) the connection after a successful login. Accounts are listed right away. */
export async function saveNtConnection(env: NtEnv, clientId: string, tokens: NtTokens): Promise<{ id: string; accounts: number }> {
  const id = `ntmcp-${env}`;
  const creds: NtCreds = { env, clientId, refreshToken: tokens.refreshToken, refreshExpiresAt: tokens.refreshExpiresAt?.toISOString() ?? null };
  let latest = creds;
  const holder: { v: { token: string; expiresAt: Date } | null } = { v: { token: tokens.accessToken, expiresAt: tokens.expiresAt } };
  const client = new NtMcpClient(
    creds,
    { get: async () => holder.v, set: async (token, expiresAt) => void (holder.v = { token, expiresAt }), clear: async () => void (holder.v = null) },
    id,
    async (c) => void (latest = c),
  );
  const accounts = await client.listAccounts();
  const sql = await db();
  await sql`
    insert into connections (id, provider, firm, label, username_hint, environment, credentials_enc, status, last_error, last_sync_at, token_enc, token_expires_at)
    values (
      ${id}, 'ntmcp', 'tradovate-login', ${env === "demo" ? "Tradovate (prop)" : "Tradovate (live)"}, ${`${accounts.length} account${accounts.length === 1 ? "" : "s"}`}, ${env},
      ${encryptJson(latest, `creds:${id}`)}, 'connected', null, null,
      ${holder.v ? encryptJson(holder.v.token, `token:${id}`) : null}, ${holder.v?.expiresAt ?? null}
    )
    on conflict (id) do update set
      provider = excluded.provider, firm = excluded.firm, label = excluded.label, username_hint = excluded.username_hint,
      environment = excluded.environment, credentials_enc = excluded.credentials_enc, status = 'connected', last_error = null,
      token_enc = excluded.token_enc, token_expires_at = excluded.token_expires_at, syncing_at = null, updated_at = now()
  `;
  for (const a of accounts) {
    await sql`
      insert into broker_accounts (id, provider, external_id, name, is_sim, balance, active)
      values (${`${id}:${a.externalId}`}, ${id}, ${a.externalId}, ${a.name}, ${a.isSim}, ${a.balance}, ${a.active})
      on conflict (id) do update set name = excluded.name, balance = excluded.balance, active = excluded.active, updated_at = now()
    `;
  }
  return { id, accounts: accounts.length };
}
