import { db } from "../db";

/**
 * Trades the bot placed on your accounts show up again in the journal (broker
 * sync and CSV imports). They're the strategy's, not yours, so they're marked
 * and kept out of the journal: same direction and size as a real bot order,
 * entered from 1 minute before to 3 minutes after the bot's signal. The rows
 * are kept (marked), so a re-sync or re-import can't bring them back.
 */
export async function hideBotCopies(): Promise<number> {
  const sql = await db();
  const rows = await sql<{ id: string }[]>`
    update trades t set by_bot = true
    where not t.by_bot and t.root in ('MNQ', 'NQ') and exists (
      select 1 from bot_trades b
      where b.mode = 'live' and b.status in ('open', 'closed') and coalesce(b.order_id, '') <> ''
        and lower(b.dir) = t.direction and b.qty = t.qty
        and t.entry_time between b.entered_at - interval '1 minute' and b.entered_at + interval '3 minutes'
    ) or not t.by_bot and t.root in ('MNQ', 'NQ') and exists (
      select 1 from pass_trades p
      where p.mode = 'live' and p.status in ('open', 'closed') and coalesce(p.order_id, '') <> ''
        and lower(p.dir) = t.direction and p.qty = t.qty
        and t.entry_time between p.entered_at - interval '1 minute' and p.entered_at + interval '3 minutes'
    )
    returning t.id
  `;
  return rows.length;
}
