import "server-only";
import { db } from "../db";
import { randomToken } from "../crypto";
import type { LedgerEntry, LedgerKind } from "../analytics/ledger";

type LedgerRow = {
  id: string;
  day: string;
  firm: string;
  account: string | null;
  kind: LedgerKind;
  amount: string | number; // numeric(12,2) arrives as a string
  qty: number;
  note: string | null;
  created_at: Date | string | null;
};

function rowToEntry(r: LedgerRow): LedgerEntry {
  return {
    id: r.id,
    day: r.day,
    firm: r.firm,
    account: r.account,
    kind: r.kind,
    amount: Number(r.amount),
    qty: r.qty ?? 1,
    note: r.note,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  };
}

/** Every ledger entry, newest first. A single owner keeps hundreds at most, so no paging. */
export async function listLedger(): Promise<LedgerEntry[]> {
  const sql = await db();
  const rows = await sql<LedgerRow[]>`
    select id, day, firm, account, kind, amount, qty, note, created_at
    from prop_ledger
    order by day desc, created_at desc
    limit 2000
  `;
  return rows.map(rowToEntry);
}

export type NewLedgerEntry = Omit<LedgerEntry, "id" | "createdAt">;

export async function insertLedgerEntry(e: NewLedgerEntry): Promise<LedgerEntry> {
  const sql = await db();
  const id = `led_${randomToken(12)}`;
  const rows = await sql<LedgerRow[]>`
    insert into prop_ledger (id, day, firm, account, kind, amount, qty, note)
    values (${id}, ${e.day}, ${e.firm}, ${e.account}, ${e.kind}, ${e.amount.toFixed(2)}, ${e.qty}, ${e.note})
    returning id, day, firm, account, kind, amount, qty, note, created_at
  `;
  return rowToEntry(rows[0]!);
}

export async function deleteLedgerEntry(id: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`delete from prop_ledger where id = ${id} returning id`;
  return rows.length > 0;
}
