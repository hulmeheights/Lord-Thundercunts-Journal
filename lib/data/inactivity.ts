import "server-only";
import { db } from "../db";
import { dayKey } from "../analytics/time";
import type { WatchedAccount } from "../analytics/inactivity";
import { getSettings } from "./settings";

/**
 * Every account the journal knows: synced broker accounts plus any account id
 * seen on a trade (imports). Its firm is the one you set, else its
 * connection's name; its last trade day is in your timezone.
 */
export async function watchedAccounts(): Promise<WatchedAccount[]> {
  const sql = await db();
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const [accounts, conns, last] = await Promise.all([
    sql<{ id: string; provider: string; name: string; active: boolean; updated_at: Date }[]>`select id, provider, name, active, updated_at from broker_accounts`,
    sql<{ id: string; label: string }[]>`select id, label from connections`,
    sql<{ account_id: string; last: Date; first: Date }[]>`
      select account_id, max(entry_time) as last, min(entry_time) as first from trades
      where account_id is not null and source <> 'sample' group by account_id
    `,
  ]);
  const label = new Map(conns.map((c) => [c.id, c.label]));
  const seen = new Map(last.map((r) => [r.account_id, r]));
  const out = new Map<string, WatchedAccount>();
  const firmFor = (id: string, fallback: string) => settings.inactivity.firmOf[id] || fallback;
  for (const a of accounts) {
    if (!a.active) continue;
    const t = seen.get(a.id);
    out.set(a.id, {
      id: a.id,
      name: a.name,
      firm: firmFor(a.id, label.get(a.provider) ?? (a.provider === "import" ? "" : a.provider)),
      lastTrade: t ? dayKey(t.last, tz) : null,
      since: dayKey(t?.first ?? a.updated_at, tz),
    });
  }
  for (const r of last) {
    if (out.has(r.account_id)) continue;
    const conn = r.account_id.split(":")[0]!;
    out.set(r.account_id, {
      id: r.account_id,
      name: r.account_id.includes(":") ? r.account_id.split(":").slice(1).join(":") : r.account_id,
      firm: firmFor(r.account_id, conn === "import" ? "" : (label.get(conn) ?? "")),
      lastTrade: dayKey(r.last, tz),
      since: dayKey(r.first, tz),
    });
  }
  return [...out.values()].sort((a, b) => a.firm.localeCompare(b.firm) || a.name.localeCompare(b.name));
}
