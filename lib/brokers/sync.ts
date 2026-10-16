import "server-only";
import { db } from "../db";
import { decryptJson, encryptJson } from "../crypto";
import { ProjectXClient, type ProjectXCreds } from "./projectx";
import { buildRoundTrips, type BuiltTrade, type NormalizedFill } from "./roundtrip";
import { TradovateClient, type TradovateCreds } from "./tradovate";
import { TopstepShareClient, type ShareCreds } from "./topstepshare";
import { NtMcpClient, type NtCreds } from "./ntmcp";
import type { PlatformKind } from "./firms";
import { BrokerError, type BrokerAccountInfo, type BrokerClient, type TokenCache } from "./types";

export type SyncResult = {
  connection: string;
  ok: boolean;
  skipped?: boolean;
  accounts?: number;
  newFills?: number;
  trades?: number;
  openPositions?: number;
  error?: string;
};

const BACKFILL_DAYS = 365;
const OVERLAP_DAYS = 3;

/** Normalises legacy provider names ("topstepx") to a platform kind. */
export function kindOf(provider: string): PlatformKind {
  if (provider === "tradovate") return "tradovate";
  if (provider === "share") return "share";
  if (provider === "ntmcp") return "ntmcp";
  return "projectx";
}

/** Credentials are bound (AAD) to their connection id; legacy rows used the provider name. */
function decryptCreds<T>(enc: string, connectionId: string, provider: string): T {
  try {
    return decryptJson<T>(enc, `creds:${connectionId}`);
  } catch {
    return decryptJson<T>(enc, `creds:${provider}`);
  }
}

function tokenCache(connectionId: string): TokenCache {
  return {
    async get() {
      const sql = await db();
      const [row] = await sql<{ token_enc: string | null; token_expires_at: Date | null }[]>`
        select token_enc, token_expires_at from connections where id = ${connectionId}
      `;
      if (!row?.token_enc || !row.token_expires_at) return null;
      try {
        return { token: decryptJson<string>(row.token_enc, `token:${connectionId}`), expiresAt: row.token_expires_at };
      } catch {
        return null;
      }
    },
    async set(token, expiresAt) {
      const sql = await db();
      await sql`
        update connections set token_enc = ${encryptJson(token, `token:${connectionId}`)}, token_expires_at = ${expiresAt}
        where id = ${connectionId}
      `;
    },
    async clear() {
      const sql = await db();
      await sql`update connections set token_enc = null, token_expires_at = null where id = ${connectionId}`;
    },
  };
}

export function makeClient(
  connectionId: string,
  kind: PlatformKind,
  creds: ProjectXCreds | TradovateCreds | ShareCreds | NtCreds,
  cache: TokenCache,
): BrokerClient {
  if (kind === "ntmcp") {
    return new NtMcpClient(creds as NtCreds, cache, connectionId, async (next) => {
      const sql = await db();
      await sql`update connections set credentials_enc = ${encryptJson(next, `creds:${connectionId}`)}, updated_at = now() where id = ${connectionId}`;
    });
  }
  if (kind === "share") return new TopstepShareClient(creds as ShareCreds, connectionId);
  return kind === "projectx"
    ? new ProjectXClient(creds as ProjectXCreds, cache, connectionId)
    : new TradovateClient(creds as TradovateCreds, cache, connectionId);
}

/** Verifies credentials by logging in and listing accounts (used when connecting). */
export async function testCredentials(
  connectionId: string,
  kind: PlatformKind,
  creds: ProjectXCreds | TradovateCreds | ShareCreds,
): Promise<{ accounts: BrokerAccountInfo[]; token: { token: string; expiresAt: Date } | null }> {
  const holder: { v: { token: string; expiresAt: Date } | null } = { v: null };
  const cache: TokenCache = {
    async get() { return holder.v; },
    async set(token, expiresAt) { holder.v = { token, expiresAt }; },
    async clear() { holder.v = null; },
  };
  const accounts = await makeClient(connectionId, kind, creds, cache).listAccounts();
  // Hand back the fresh token so the first sync doesn't need a second login.
  return { accounts, token: holder.v };
}

async function upsertFills(fills: NormalizedFill[]): Promise<number> {
  if (!fills.length) return 0;
  const sql = await db();
  let inserted = 0;
  for (let i = 0; i < fills.length; i += 500) {
    const rows = fills.slice(i, i + 500).map((f) => ({
      id: f.id,
      provider: f.provider,
      account_id: f.accountId,
      contract_id: f.contractId,
      symbol: f.symbol,
      side: f.side,
      qty: f.qty,
      price: f.price,
      ts: f.ts,
      fees: f.fees,
      broker_pnl: f.brokerPnl,
      point_value: f.pointValue,
    }));
    const res = await sql<{ inserted: boolean }[]>`
      insert into fills ${sql(rows)}
      on conflict (id) do update set
        symbol = excluded.symbol, qty = excluded.qty, price = excluded.price, ts = excluded.ts,
        fees = excluded.fees, broker_pnl = excluded.broker_pnl, point_value = excluded.point_value
      returning (xmax = 0) as inserted
    `;
    inserted += res.filter((r) => r.inserted).length;
  }
  return inserted;
}

type FillRow = {
  id: string; provider: string; account_id: string; contract_id: string; symbol: string; side: "buy" | "sell";
  qty: number; price: number; ts: Date; fees: number; broker_pnl: number | null; point_value: number;
};

/** Inserts/updates computed trade fields only — journal annotations are never overwritten. */
export async function upsertComputedTrades(source: string, trades: BuiltTrade[]): Promise<number> {
  const sql = await db();
  let inserted = 0;
  for (let i = 0; i < trades.length; i += 500) {
    const chunk = trades.slice(i, i + 500).map((t) => ({
      id: t.id, source, account_id: t.accountId, symbol: t.symbol, root: t.root, direction: t.direction,
      qty: t.qty, max_position: t.maxPosition, entry_time: t.entryTime, exit_time: t.exitTime,
      entry_price: t.entryPrice, exit_price: t.exitPrice, gross_pnl: t.grossPnl, fees: t.fees, net_pnl: t.netPnl,
      point_value: t.pointValue, fill_count: t.fillCount,
    }));
    const res = await sql<{ inserted: boolean }[]>`
      insert into trades ${sql(chunk)}
      on conflict (id) do update set
        symbol = excluded.symbol, root = excluded.root, direction = excluded.direction, qty = excluded.qty,
        max_position = excluded.max_position, entry_time = excluded.entry_time, exit_time = excluded.exit_time,
        entry_price = excluded.entry_price, exit_price = excluded.exit_price, gross_pnl = excluded.gross_pnl,
        fees = excluded.fees, net_pnl = excluded.net_pnl, point_value = excluded.point_value,
        fill_count = excluded.fill_count, updated_at = now()
      returning (xmax = 0) as inserted
    `;
    inserted += res.filter((r) => r.inserted).length;
  }
  return inserted;
}

/** Rebuilds round-trip trades from every stored fill, preserving journal annotations. */
export async function rebuildTrades(source: string, accountIds: string[]): Promise<{ trades: number; openPositions: number }> {
  const sql = await db();
  let total = 0, open = 0;
  for (const accountId of accountIds) {
    const rows = await sql<FillRow[]>`select * from fills where account_id = ${accountId} order by ts, id`;
    const { trades, openPositions } = buildRoundTrips(
      rows.map((r) => ({
        id: r.id, provider: r.provider, accountId: r.account_id, contractId: r.contract_id, symbol: r.symbol,
        side: r.side, qty: r.qty, price: r.price, ts: r.ts.toISOString(), fees: r.fees,
        brokerPnl: r.broker_pnl, pointValue: r.point_value,
      })),
    );
    open += openPositions;
    total += trades.length;
    await upsertComputedTrades(source, trades);
    // Remove stale computed trades that no longer exist — but never one you've annotated.
    const ids = trades.map((t) => t.id);
    await sql`
      delete from trades
      where account_id = ${accountId} and source = ${source}
        and not (id = any(${sql.array(ids)}::text[]))
        and setup is null and notes is null and emotion is null and rating is null
        and cardinality(tags) = 0 and cardinality(mistakes) = 0
    `;
  }
  return { trades: total, openPositions: open };
}

/** Acquire a short-lived per-connection lock so overlapping syncs can't collide. */
async function acquire(connectionId: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`
    update connections set syncing_at = now()
    where id = ${connectionId} and (syncing_at is null or syncing_at < now() - interval '3 minutes')
    returning id
  `;
  return rows.length > 0;
}

export async function syncConnection(connectionId: string, opts: { full?: boolean } = {}): Promise<SyncResult> {
  const sql = await db();
  const [conn] = await sql<{ provider: string; credentials_enc: string; last_sync_at: Date | null }[]>`
    select provider, credentials_enc, last_sync_at from connections where id = ${connectionId}
  `;
  if (!conn) return { connection: connectionId, ok: false, error: "Not connected" };
  if (!(await acquire(connectionId))) return { connection: connectionId, ok: true, skipped: true };

  try {
    const kind = kindOf(conn.provider);
    const creds = decryptCreds<ProjectXCreds | TradovateCreds | ShareCreds | NtCreds>(conn.credentials_enc, connectionId, conn.provider);
    const client = makeClient(connectionId, kind, creds, tokenCache(connectionId));
    const accounts = await client.listAccounts();
    for (const a of accounts) {
      await sql`
        insert into broker_accounts (id, provider, external_id, name, is_sim, balance, active)
        values (${`${connectionId}:${a.externalId}`}, ${connectionId}, ${a.externalId}, ${a.name}, ${a.isSim}, ${a.balance}, ${a.active})
        on conflict (id) do update set name = excluded.name, is_sim = excluded.is_sim,
          balance = excluded.balance, active = excluded.active, updated_at = now()
      `;
    }
    const includedRows = await sql<{ external_id: string }[]>`
      select external_id from broker_accounts where provider = ${connectionId} and included
    `;
    const included = new Set(includedRows.map((r) => r.external_id));
    const targets = accounts.filter((a) => included.has(a.externalId));

    const since = opts.full || !conn.last_sync_at
      ? new Date(Date.now() - BACKFILL_DAYS * 86_400_000)
      : new Date(conn.last_sync_at.getTime() - OVERLAP_DAYS * 86_400_000);
    let newFills = 0;
    let rebuilt = { trades: 0, openPositions: 0 };
    if (client.listTrades) {
      // Source reports finished round trips — store them directly.
      const trades = await client.listTrades(targets, since);
      newFills = await upsertComputedTrades(connectionId, trades);
      rebuilt = { trades: trades.length, openPositions: 0 };
    } else {
      const fills = await client.listFills(targets, since);
      newFills = await upsertFills(fills);
      const touched = opts.full || newFills > 0 || !conn.last_sync_at
        ? targets.map((a) => `${connectionId}:${a.externalId}`)
        : [];
      if (touched.length) rebuilt = await rebuildTrades(connectionId, touched);
    }

    await sql`
      update connections set status = 'connected', last_sync_at = now(), last_error = null, syncing_at = null, updated_at = now()
      where id = ${connectionId}
    `;
    return { connection: connectionId, ok: true, accounts: accounts.length, newFills, trades: rebuilt.trades, openPositions: rebuilt.openPositions };
  } catch (err) {
    const message = err instanceof BrokerError ? err.message : "Sync failed unexpectedly. Check your credentials and try again.";
    if (!(err instanceof BrokerError)) console.error(`[sync:${connectionId}]`, err instanceof Error ? err.name : "error");
    await sql`
      update connections set status = 'error', last_error = ${message}, syncing_at = null, updated_at = now()
      where id = ${connectionId}
    `;
    return { connection: connectionId, ok: false, error: message };
  }
}

export async function syncAll(opts: { full?: boolean; staleMinutes?: number } = {}): Promise<SyncResult[]> {
  const sql = await db();
  const conns = await sql<{ id: string; last_sync_at: Date | null }[]>`select id, last_sync_at from connections order by id`;
  const results: SyncResult[] = [];
  for (const c of conns) {
    if (opts.staleMinutes && c.last_sync_at && Date.now() - c.last_sync_at.getTime() < opts.staleMinutes * 60_000) {
      results.push({ connection: c.id, ok: true, skipped: true });
      continue;
    }
    results.push(await syncConnection(c.id, { full: opts.full }));
  }
  return results;
}
