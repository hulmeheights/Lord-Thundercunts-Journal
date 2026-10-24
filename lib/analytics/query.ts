/**
 * Exact slicing of the trade log for the coach: filter by date, entry time,
 * weekday, setup, symbol, side or outcome, then group by any bucket (down to
 * five-minute entry windows). The coach calls this as a tool, so its numbers
 * come from the trades themselves, not from summaries.
 */
import { z } from "zod";
import type { Trade, TradingRules } from "../types";
import { evaluateRules } from "./rules";
import { sortByEntry } from "./stats";
import { dayKey, fmtMinute, holdMinutes, minuteOfDay, parseHHMM, startOfWeek, WEEKDAYS, weekdayIndex } from "./time";

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TradeQuery = z.object({
  from: DAY.optional().describe("First day to include, YYYY-MM-DD (trader's timezone). Omit for all history."),
  to: DAY.optional().describe("Last day to include, YYYY-MM-DD."),
  entryFrom: HHMM.optional().describe("Only trades entered at or after this local time, HH:MM."),
  entryTo: HHMM.optional().describe("Only trades entered before this local time, HH:MM."),
  weekdays: z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])).optional(),
  setup: z.string().max(60).optional().describe("Only trades tagged with this setup (case-insensitive)."),
  symbol: z.string().max(20).optional().describe("Root or symbol, e.g. MNQ."),
  direction: z.enum(["long", "short"]).optional(),
  outcome: z.enum(["win", "loss"]).optional(),
  ruleBreaks: z.enum(["only", "exclude"]).optional().describe("Only rule-breaking trades, or only compliant ones."),
  groupBy: z
    .enum(["none", "entryMinutes", "hour", "weekday", "day", "week", "month", "setup", "symbol", "direction", "tradeNumberOfDay", "holdTime", "ruleBreak", "account"])
    .default("none"),
  bucketMinutes: z.number().int().min(1).max(120).optional().describe("Bucket size for groupBy entryMinutes, e.g. 15 for 14:30, 14:45, 15:00…"),
  listTrades: z.boolean().optional().describe("Also return the matching trades (newest first, up to 80)."),
});
export type TradeQuery = z.infer<typeof TradeQuery>;

export type QueryStats = { trades: number; net: number; winRate: number | null; avg: number | null; profitFactor: number | null; best: number | null; worst: number | null; netWithoutBest: number | null };
export type QueryResult = {
  matched: QueryStats;
  groups?: ({ key: string } & QueryStats)[];
  trades?: { entry: string; exit: string; symbol: string; side: string; qty: number; net: number; holdMin: number; setups: string[]; mistakes: string[]; brokeRules: boolean }[];
  note?: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function stats(ts: Trade[]): QueryStats {
  if (!ts.length) return { trades: 0, net: 0, winRate: null, avg: null, profitFactor: null, best: null, worst: null, netWithoutBest: null };
  const net = ts.reduce((s, t) => s + t.netPnl, 0);
  const won = ts.filter((t) => t.netPnl > 0).reduce((s, t) => s + t.netPnl, 0);
  const lost = -ts.filter((t) => t.netPnl < 0).reduce((s, t) => s + t.netPnl, 0);
  const best = Math.max(...ts.map((t) => t.netPnl));
  return {
    trades: ts.length,
    net: r2(net),
    winRate: r2((ts.filter((t) => t.netPnl > 0).length / ts.length) * 100),
    avg: r2(net / ts.length),
    profitFactor: lost > 0 ? r2(won / lost) : null,
    best: r2(best),
    worst: r2(Math.min(...ts.map((t) => t.netPnl))),
    // What's left without the single best trade: shows when one winner carries a bucket.
    netWithoutBest: r2(net - best),
  };
}

const HOLD = [
  [1, "under 1m"],
  [5, "1–5m"],
  [15, "5–15m"],
  [30, "15–30m"],
  [60, "30–60m"],
  [Infinity, "60m+"],
] as const;

export function queryTrades(all: Trade[], q: TradeQuery, rules: TradingRules, tz: string): QueryResult {
  const breaks = evaluateRules(all, rules, tz).violatingTradeIds;
  // Trade number within its day, from the full log so filters don't renumber.
  const nth = new Map<string, number>();
  const perDay = new Map<string, Trade[]>();
  for (const t of all) perDay.set(dayKey(t.entryTime, tz), [...(perDay.get(dayKey(t.entryTime, tz)) ?? []), t]);
  for (const list of perDay.values()) sortByEntry(list).forEach((t, i) => nth.set(t.id, i + 1));

  const from = parseHHMM(q.entryFrom);
  const to = parseHHMM(q.entryTo);
  const setup = q.setup?.trim().toLowerCase();
  const symbol = q.symbol?.trim().toUpperCase();
  const ts = all.filter((t) => {
    const d = dayKey(t.entryTime, tz);
    if (q.from && d < q.from) return false;
    if (q.to && d > q.to) return false;
    const m = minuteOfDay(t.entryTime, tz);
    if (from !== null && m < from) return false;
    if (to !== null && m >= to) return false;
    if (q.weekdays?.length && !q.weekdays.includes(WEEKDAYS[weekdayIndex(d)] as (typeof q.weekdays)[number])) return false;
    if (setup && !t.setups.some((s) => s.toLowerCase() === setup)) return false;
    if (symbol && t.root.toUpperCase() !== symbol && !t.symbol.toUpperCase().startsWith(symbol)) return false;
    if (q.direction && t.direction !== q.direction) return false;
    if (q.outcome === "win" && !(t.netPnl > 0)) return false;
    if (q.outcome === "loss" && !(t.netPnl < 0)) return false;
    if (q.ruleBreaks === "only" && !breaks.has(t.id)) return false;
    if (q.ruleBreaks === "exclude" && breaks.has(t.id)) return false;
    return true;
  });

  const out: QueryResult = { matched: stats(ts) };
  if (q.groupBy !== "none") {
    const size = q.bucketMinutes ?? 15;
    const keyOf = (t: Trade): string[] => {
      const d = dayKey(t.entryTime, tz);
      switch (q.groupBy) {
        case "entryMinutes": {
          const start = Math.floor(minuteOfDay(t.entryTime, tz) / size) * size;
          return [`${fmtMinute(start)}–${fmtMinute(Math.min(start + size, 24 * 60) % (24 * 60))}`];
        }
        case "hour": return [`${fmtMinute(Math.floor(minuteOfDay(t.entryTime, tz) / 60) * 60)}–${fmtMinute(((Math.floor(minuteOfDay(t.entryTime, tz) / 60) + 1) % 24) * 60)}`];
        case "weekday": return [WEEKDAYS[weekdayIndex(d)]!];
        case "day": return [d];
        case "week": return [`week of ${startOfWeek(d)}`];
        case "month": return [d.slice(0, 7)];
        case "setup": return t.setups.length ? t.setups : ["(no setup tagged)"];
        case "symbol": return [t.root || t.symbol];
        case "direction": return [t.direction];
        case "tradeNumberOfDay": return [`trade #${nth.get(t.id) ?? "?"} of the day`];
        case "holdTime": return [HOLD.find(([max]) => holdMinutes(t.entryTime, t.exitTime) < max)![1]];
        case "ruleBreak": return [breaks.has(t.id) ? "broke a rule" : "within rules"];
        case "account": return [t.accountId ?? t.source];
        default: return ["all"];
      }
    };
    const groups = new Map<string, Trade[]>();
    for (const t of ts) for (const k of keyOf(t)) groups.set(k, [...(groups.get(k) ?? []), t]);
    out.groups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })).map(([key, g]) => ({ key, ...stats(g) }));
  }
  if (q.listTrades) {
    out.trades = [...ts]
      .sort((a, b) => b.entryTime.localeCompare(a.entryTime))
      .slice(0, 80)
      .map((t) => ({
        entry: `${dayKey(t.entryTime, tz)} ${fmtMinute(minuteOfDay(t.entryTime, tz))}`,
        exit: fmtMinute(minuteOfDay(t.exitTime, tz)),
        symbol: t.root || t.symbol,
        side: t.direction,
        qty: t.qty,
        net: r2(t.netPnl),
        holdMin: Math.round(holdMinutes(t.entryTime, t.exitTime)),
        setups: t.setups,
        mistakes: t.mistakes,
        brokeRules: breaks.has(t.id),
      }));
    if (ts.length > 80) out.note = `Showing the newest 80 of ${ts.length} trades; the stats cover all ${ts.length}.`;
  }
  return out;
}
