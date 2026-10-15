import "server-only";
import { db } from "../db";
import type { BrokerAccount, ConnectionInfo, Provider } from "../types";

export async function listConnections(): Promise<ConnectionInfo[]> {
  const sql = await db();
  const rows = await sql<{
    id: string; provider: string; firm: string | null; label: string; username_hint: string | null; environment: string;
    status: string; last_sync_at: Date | null; last_error: string | null;
  }[]>`
    select id, provider, firm, label, username_hint, environment, status, last_sync_at, last_error
    from connections order by created_at
  `;
  return rows.map((r) => ({
    id: r.id,
    provider: (r.provider === "tradovate" ? "tradovate" : "projectx") as Provider,
    firm: r.firm,
    label: r.label,
    usernameHint: r.username_hint,
    environment: r.environment,
    status: r.status,
    lastSyncAt: r.last_sync_at?.toISOString() ?? null,
    lastError: r.last_error,
  }));
}

export async function listBrokerAccounts(): Promise<BrokerAccount[]> {
  const sql = await db();
  const rows = await sql<{
    id: string; provider: string; external_id: string; name: string; is_sim: boolean; balance: number | null;
    active: boolean; included: boolean;
  }[]>`select * from broker_accounts order by provider, active desc, name`;
  return rows.map((r) => ({
    id: r.id,
    connectionId: r.provider,
    externalId: r.external_id,
    name: r.name,
    isSim: r.is_sim,
    balance: r.balance,
    active: r.active,
    included: r.included,
  }));
}

/** Masks a username for display, e.g. "thunderlord" → "th•••••rd". */
export function maskHint(s: string): string {
  if (s.length <= 4) return `${s[0] ?? ""}•••`;
  return `${s.slice(0, 2)}${"•".repeat(Math.min(6, s.length - 4))}${s.slice(-2)}`;
}
