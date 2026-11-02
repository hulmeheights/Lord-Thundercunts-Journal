import "server-only";
import { db } from "../db";
import type { HistSource, HistTrade } from "../bot/history";
import type { Session } from "../bot/signal";

export type HistImportView = { id: string; source: HistSource; fileName: string | null; account: string | null; rows: number; added: number; at: string };

/**
 * The live side, built by itself: every trade the bot placed on your Topstep
 * accounts and closed. One signal = one trade (P&L added across accounts);
 * perAccount keeps each account's own rows.
 */
export async function liveRecord(): Promise<{ trades: HistTrade[]; perAccount: HistTrade[] }> {
  const sql = await db();
  const rows = await sql<{ id: string; signal_id: string; account_label: string; dir: "LONG" | "SHORT"; qty: number; entry_price: number; exit_price: number | null; pnl: number; session: Session; entered_at: Date; exited_at: Date | null }[]>`
    select id, signal_id, account_label, dir, qty, entry_price, exit_price, pnl, session, entered_at, exited_at
    from bot_trades where mode = 'live' and status = 'closed' and pnl is not null order by entered_at
  `;
  const perAccount: HistTrade[] = rows.map((r) => ({ key: r.id, entryAt: r.entered_at.toISOString(), exitAt: r.exited_at?.toISOString() ?? null, dir: r.dir, entry: r.entry_price, exit: r.exit_price, qty: r.qty, pnl: r.pnl, session: r.session, account: r.account_label, symbol: "MNQ", signal: null }));
  const bySignal = new Map<string, HistTrade>();
  rows.forEach((r, i) => {
    const t = bySignal.get(r.signal_id);
    if (t) {
      t.pnl = Math.round((t.pnl + r.pnl) * 100) / 100;
      t.qty += r.qty;
    } else bySignal.set(r.signal_id, { ...perAccount[i]!, key: r.signal_id, account: null });
  });
  return { trades: [...bySignal.values()], perAccount };
}

/** One book of the track record, oldest first, and the imports that built it. */
export async function trackRecord(source: "tv"): Promise<{ trades: HistTrade[]; imports: HistImportView[] }> {
  const sql = await db();
  const [rows, imports] = await Promise.all([
    sql<{ id: string; account: string | null; symbol: string | null; dir: "LONG" | "SHORT"; qty: number; entry_at: Date; exit_at: Date | null; entry_price: number | null; exit_price: number | null; pnl: number; session: Session; signal: string | null }[]>`
      select id, account, symbol, dir, qty, entry_at, exit_at, entry_price, exit_price, pnl, session, signal from bot_history where source = ${source} order by entry_at
    `,
    sql<{ id: string; source: HistSource; file_name: string | null; account: string | null; rows: number; added: number; created_at: Date }[]>`
      select * from bot_history_imports where source = ${source} order by created_at desc limit 50
    `,
  ]);
  return {
    trades: rows.map((r) => ({ key: r.id, entryAt: r.entry_at.toISOString(), exitAt: r.exit_at?.toISOString() ?? null, dir: r.dir, entry: r.entry_price, exit: r.exit_price, qty: r.qty, pnl: r.pnl, session: r.session, account: r.account, symbol: r.symbol, signal: r.signal })),
    imports: imports.map((i) => ({ id: i.id, source: i.source, fileName: i.file_name, account: i.account, rows: i.rows, added: i.added, at: i.created_at.toISOString() })),
  };
}
