import "server-only";
import { db } from "../db";
import type { Trade, TradeSource } from "../types";
import type { Grade } from "../analytics/grades";

type TradeRow = {
  id: string; source: TradeSource; account_id: string | null; symbol: string; root: string; direction: "long" | "short";
  qty: number; max_position: number | null; entry_time: Date; exit_time: Date; entry_price: number; exit_price: number;
  gross_pnl: number; fees: number; net_pnl: number; point_value: number; fill_count: number; setups: string[];
  tags: string[]; mistakes: string[]; emotion: string | null; rating: number | null; grade: Grade | null; notes: string | null;
  planned_risk: number | null; followed_plan: boolean | null; chart_url: string | null;
};

export function rowToTrade(r: TradeRow): Trade {
  return {
    id: r.id,
    source: r.source,
    accountId: r.account_id,
    symbol: r.symbol,
    root: r.root,
    direction: r.direction,
    qty: r.qty,
    maxPosition: r.max_position,
    entryTime: r.entry_time.toISOString(),
    exitTime: r.exit_time.toISOString(),
    entryPrice: r.entry_price,
    exitPrice: r.exit_price,
    grossPnl: r.gross_pnl,
    fees: r.fees,
    netPnl: r.net_pnl,
    pointValue: r.point_value,
    fillCount: r.fill_count,
    setups: r.setups ?? [],
    tags: r.tags ?? [],
    mistakes: r.mistakes ?? [],
    emotion: r.emotion,
    rating: r.rating,
    grade: r.grade ?? null,
    notes: r.notes,
    plannedRisk: r.planned_risk,
    followedPlan: r.followed_plan,
    chartUrl: r.chart_url,
  };
}

/** Trades whose exit falls within [since, until). Times are ISO strings. */
export async function listTrades(opts: { since?: Date; until?: Date; limit?: number } = {}): Promise<Trade[]> {
  const sql = await db();
  const since = opts.since ?? new Date("2000-01-01T00:00:00Z");
  const until = opts.until ?? new Date("2100-01-01T00:00:00Z");
  const limit = Math.min(opts.limit ?? 20_000, 20_000);
  const rows = await sql<TradeRow[]>`
    select t.* from trades t
    left join broker_accounts a on a.id = t.account_id
    where t.exit_time >= ${since} and t.exit_time < ${until}
      and (a.id is null or a.included)
    order by t.exit_time desc
    limit ${limit}
  `;
  return rows.map(rowToTrade).reverse();
}

export async function getTrade(id: string): Promise<Trade | null> {
  const sql = await db();
  const rows = await sql<TradeRow[]>`select * from trades where id = ${id}`;
  return rows[0] ? rowToTrade(rows[0]) : null;
}

export type TradeJournalPatch = Partial<
  Pick<Trade, "setups" | "tags" | "mistakes" | "emotion" | "rating" | "grade" | "notes" | "plannedRisk" | "followedPlan" | "chartUrl">
>;

export async function updateTradeJournal(id: string, p: TradeJournalPatch): Promise<void> {
  const sql = await db();
  const current = await getTrade(id);
  if (!current) throw new Error("Trade not found");
  const next = { ...current, ...p };
  await sql`
    update trades set
      setups = ${next.setups}, tags = ${next.tags}, mistakes = ${next.mistakes}, emotion = ${next.emotion},
      rating = ${next.rating}, grade = ${next.grade}, notes = ${next.notes}, planned_risk = ${next.plannedRisk},
      followed_plan = ${next.followedPlan}, chart_url = ${next.chartUrl}, updated_at = now()
    where id = ${id}
  `;
}

export async function insertTrades(trades: Trade[]): Promise<void> {
  if (!trades.length) return;
  const sql = await db();
  for (let i = 0; i < trades.length; i += 500) {
    const rows = trades.slice(i, i + 500).map((t) => ({
      id: t.id, source: t.source, account_id: t.accountId, symbol: t.symbol, root: t.root, direction: t.direction,
      qty: t.qty, max_position: t.maxPosition, entry_time: t.entryTime, exit_time: t.exitTime, entry_price: t.entryPrice,
      exit_price: t.exitPrice, gross_pnl: t.grossPnl, fees: t.fees, net_pnl: t.netPnl, point_value: t.pointValue,
      fill_count: t.fillCount, setups: t.setups, tags: t.tags, mistakes: t.mistakes, emotion: t.emotion, rating: t.rating,
      grade: t.grade, notes: t.notes, planned_risk: t.plannedRisk, followed_plan: t.followedPlan, chart_url: t.chartUrl,
    }));
    await sql`insert into trades ${sql(rows)} on conflict (id) do nothing`;
  }
}

/** Trades you typed in or imported can be corrected; broker-synced ones are rebuilt from fills instead. */
export const EDITABLE_SOURCES = ["manual", "sample", "import"];

export type TradeCore = Pick<
  Trade,
  "symbol" | "root" | "direction" | "qty" | "maxPosition" | "entryTime" | "exitTime" | "entryPrice" | "exitPrice" | "grossPnl" | "fees" | "netPnl" | "pointValue"
>;

export async function updateTradeCore(id: string, c: TradeCore): Promise<boolean> {
  const sql = await db();
  const rows = await sql`
    update trades set
      symbol = ${c.symbol}, root = ${c.root}, direction = ${c.direction}, qty = ${c.qty}, max_position = ${c.maxPosition},
      entry_time = ${c.entryTime}, exit_time = ${c.exitTime}, entry_price = ${c.entryPrice}, exit_price = ${c.exitPrice},
      gross_pnl = ${c.grossPnl}, fees = ${c.fees}, net_pnl = ${c.netPnl}, point_value = ${c.pointValue}, updated_at = now()
    where id = ${id} and source = any(${sql.array(EDITABLE_SOURCES)}::text[])
    returning id
  `;
  return rows.length > 0;
}

export async function deleteTrade(id: string): Promise<void> {
  const sql = await db();
  await sql`delete from trades where id = ${id} and source in ('manual', 'sample', 'import')`;
}

export async function tradeCounts(): Promise<{ total: number; sample: number }> {
  const sql = await db();
  const [r] = await sql<{ total: number; sample: number }[]>`
    select count(*)::int as total, count(*) filter (where source = 'sample')::int as sample from trades
  `;
  return { total: r?.total ?? 0, sample: r?.sample ?? 0 };
}

/** How many distinct days you've shown up — traded or journaled. Powers "Day 47". */
export async function activeDayCount(tz: string): Promise<number> {
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from (
      select to_char(exit_time at time zone ${tz}, 'YYYY-MM-DD') as d from trades
      union
      select day as d from journal_days
    ) days
  `;
  return Math.max(1, r?.n ?? 1);
}
