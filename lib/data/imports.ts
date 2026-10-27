import "server-only";
import { db } from "../db";

export type ImportSummary = {
  id: string;
  createdAt: string;
  fileName: string | null;
  accounts: string[];
  trades: number;
  net: number;
  first: string | null;
  last: string | null;
};

/** Your imports, newest first, with what each one brought in. Empty ones (all duplicates) are left out. */
export async function listImports(limit = 30): Promise<ImportSummary[]> {
  const sql = await db();
  const rows = await sql<{ id: string; created_at: Date; file_name: string | null; accounts: string[] | null; trades: number; net: number | null; first: Date | null; last: Date | null }[]>`
    select i.id, i.created_at, i.file_name,
      array_remove(array_agg(distinct coalesce(a.name, t.account_id)), null) as accounts,
      count(t.id)::int as trades, sum(t.net_pnl)::float8 as net, min(t.entry_time) as first, max(t.entry_time) as last
    from imports i
    left join trades t on t.import_id = i.id
    left join broker_accounts a on a.id = t.account_id
    group by i.id
    having count(t.id) > 0
    order by i.created_at desc
    limit ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at.toISOString(),
    fileName: r.file_name,
    accounts: r.accounts ?? [],
    trades: r.trades,
    net: Math.round((r.net ?? 0) * 100) / 100,
    first: r.first?.toISOString() ?? null,
    last: r.last?.toISOString() ?? null,
  }));
}
