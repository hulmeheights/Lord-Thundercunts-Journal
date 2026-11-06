/**
 * Track record: every trade the strategy takes, kept for good. TradingView only
 * shows a couple of weeks of 1-minute history, so each "List of trades" export
 * is merged in (repeats ignored). The live side is built by itself from what
 * the bot placed on your Topstep accounts. Pure, so it's unit-tested.
 */
import { normHeader } from "../import/csv";
import { parseDateTime, parseNumber } from "../import/values";
import { dayKey, minuteOfDay, weekdayIndex } from "../analytics/time";
import { HOLD_BUCKETS } from "../analytics/stats";
import { sessionOf, type Session } from "./signal";

export type HistSource = "tv" | "live";
export type HistTrade = {
  key: string;
  entryAt: string;
  exitAt: string | null;
  dir: "LONG" | "SHORT";
  entry: number | null;
  exit: number | null;
  qty: number;
  pnl: number;
  session: Session;
  account: string | null;
  symbol: string | null;
  signal: string | null;
};
export type HistParse = { trades: HistTrade[]; skipped: number; error?: string; tz?: string; open?: number };

const SESSION_WORD: [RegExp, Session][] = [
  [/NY\s*AM|NYAM/i, "NYAM"],
  [/NY\s*PM|NYPM/i, "NYPM"],
  [/\bLON/i, "LON"],
  [/ASIA/i, "ASIA"],
];
export const sessionInSignal = (s: string | null | undefined): Session | null => SESSION_WORD.find(([re]) => re.test(s ?? ""))?.[1] ?? null;

const col = (heads: string[], ...names: (string | RegExp)[]) => {
  for (const n of names) {
    const i = heads.findIndex((h) => (typeof n === "string" ? h === n : n.test(h)));
    if (i >= 0) return i;
  }
  return -1;
};

/**
 * TradingView Strategy Tester → List of trades → Export. Two rows per trade
 * (Entry / Exit). Times are in the chart's timezone, which the file doesn't
 * say: the one where the sessions named in the signals line up wins.
 */
export function parseTradingView(rows: string[][], tzGuesses: string[]): HistParse {
  const [head, ...data] = rows;
  if (!head) return { trades: [], skipped: 0, error: "The file is empty." };
  const h = head.map(normHeader);
  const c = {
    n: col(h, "tradenumber", "trade", "tradeno"),
    type: col(h, "type"),
    time: col(h, "dateandtime", "datetime", "date", /^date/),
    signal: col(h, "signal"),
    price: col(h, "priceusd", "price", /^price/),
    qty: col(h, "sizeqty", "contracts", "quantity", "qty", /^size/),
    pnl: col(h, "netpnlusd", "netplusd", "profitusd", "pnlusd", "netpnl", "profit", /^netp/),
  };
  if (c.n < 0 || c.type < 0 || c.time < 0 || c.pnl < 0) return { trades: [], skipped: 0, error: "This doesn't look like a TradingView List of trades export (Strategy Tester → List of trades → Export)." };

  type Leg = { time: string; price: number | null; signal: string; qty: number; pnl: number | null; dir: "LONG" | "SHORT" | null };
  const byTrade = new Map<string, { entry?: Leg; exit?: Leg }>();
  let skipped = 0;
  for (const r of data) {
    const n = r[c.n]?.trim();
    const type = (r[c.type] ?? "").toLowerCase();
    if (!n || !/entry|exit/.test(type)) {
      skipped++;
      continue;
    }
    const leg: Leg = {
      time: r[c.time] ?? "",
      price: c.price >= 0 ? parseNumber(r[c.price]) : null,
      signal: c.signal >= 0 ? (r[c.signal] ?? "").trim() : "",
      qty: Math.abs((c.qty >= 0 ? parseNumber(r[c.qty]) : null) ?? 1),
      pnl: parseNumber(r[c.pnl]),
      dir: /long/.test(type) ? "LONG" : /short/.test(type) ? "SHORT" : null,
    };
    const t = byTrade.get(n) ?? {};
    if (type.includes("entry")) t.entry = leg;
    else t.exit = leg;
    byTrade.set(n, t);
  }

  // Which timezone was the chart in? Score each guess by how many signals name the session the time falls in.
  const named = [...byTrade.values()].filter((t) => t.entry && sessionInSignal(t.entry.signal));
  const guesses = [...new Set(tzGuesses.concat(["Europe/London", "America/New_York", "UTC"]))];
  let tz = guesses[0]!;
  if (named.length) {
    let best = -1;
    for (const g of guesses) {
      const score = named.filter((t) => {
        const at = parseDateTime(t.entry!.time, g, "MDY");
        return at && sessionOf(at) === sessionInSignal(t.entry!.signal);
      }).length;
      if (score > best) [best, tz] = [score, g];
    }
  }

  const trades: HistTrade[] = [];
  let open = 0;
  for (const t of byTrade.values()) {
    const e = t.entry;
    const x = t.exit;
    if (!e || !x || /^open$/i.test(x.signal) || x.pnl === null) {
      if (e && (!x || /^open$/i.test(x.signal))) open++;
      else skipped++;
      continue;
    }
    const entryAt = parseDateTime(e.time, tz, "MDY");
    const exitAt = parseDateTime(x.time, tz, "MDY");
    const dir = e.dir ?? x.dir;
    if (!entryAt || !dir) {
      skipped++;
      continue;
    }
    trades.push({
      key: `tv|${entryAt}|${dir}`, // one trade per minute per side: the same trade from any export, even if prices are re-rounded
      entryAt,
      exitAt,
      dir,
      entry: e.price,
      exit: x.price,
      qty: e.qty,
      pnl: x.pnl,
      session: sessionInSignal(e.signal) ?? sessionOf(entryAt),
      account: null,
      symbol: "MNQ",
      signal: e.signal || null,
    });
  }
  trades.sort((a, b) => a.entryAt.localeCompare(b.entryAt));
  return { trades, skipped, tz, open };
}

// ── Stats ───────────────────────────────────────────────────────────────────

export type Tally = { n: number; won: number; winRate: number | null; net: number; pf: number | null; avgWin: number | null; avgLoss: number | null };
export function tally(ts: { pnl: number }[]): Tally {
  const wins = ts.filter((t) => t.pnl > 0);
  const losses = ts.filter((t) => t.pnl < 0);
  const gw = wins.reduce((s, t) => s + t.pnl, 0);
  const gl = -losses.reduce((s, t) => s + t.pnl, 0);
  return {
    n: ts.length,
    won: wins.length,
    winRate: ts.length ? wins.length / ts.length : null,
    net: Math.round((gw - gl) * 100) / 100,
    pf: gl > 0 ? gw / gl : wins.length ? Infinity : null,
    avgWin: wins.length ? gw / wins.length : null,
    avgLoss: losses.length ? -gl / losses.length : null,
  };
}

const group = <T, K extends string>(xs: T[], k: (x: T) => K) => {
  const m = new Map<K, T[]>();
  for (const x of xs) m.set(k(x), [...(m.get(k(x)) ?? []), x]);
  return m;
};
/** Minutes from entry to exit (null while open or when the exit time is missing). */
export const holdMins = (t: HistTrade) => {
  if (!t.exitAt) return null;
  const m = (Date.parse(t.exitAt) - Date.parse(t.entryAt)) / 60_000;
  return Number.isFinite(m) && m >= 0 ? m : null;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Everything the Track record shows, with times in your own timezone. */
export function historyStats(trades: HistTrade[], tz: string) {
  const ts = [...trades].sort((a, b) => a.entryAt.localeCompare(b.entryAt));
  const month = (t: HistTrade) => dayKey(t.entryAt, tz).slice(0, 7);
  const week = (t: HistTrade) => {
    const d = dayKey(t.entryAt, tz);
    const back = weekdayIndex(d);
    return new Date(Date.parse(`${d}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
  };
  // Win rate over time: all trades so far, and the last 20.
  let w = 0;
  const cumulative: number[] = [];
  const rolling: number[] = [];
  ts.forEach((t, i) => {
    if (t.pnl > 0) w++;
    cumulative.push(Math.round((w / (i + 1)) * 1000) / 10);
    const last = ts.slice(Math.max(0, i - 19), i + 1);
    rolling.push(Math.round((last.filter((x) => x.pnl > 0).length / last.length) * 1000) / 10);
  });
  const hours = group(ts, (t) => String(Math.floor(minuteOfDay(t.entryAt, tz) / 60)).padStart(2, "0"));
  return {
    all: tally(ts),
    first: ts[0]?.entryAt ?? null,
    last: ts.at(-1)?.entryAt ?? null,
    over: { cumulative, rolling, labels: ts.map((t) => dayKey(t.entryAt, tz)) },
    months: [...group(ts, month)].map(([k, v]) => ({ key: k, ...tally(v) })).reverse(),
    weeks: [...group(ts, week)].map(([k, v]) => ({ key: k, ...tally(v) })).reverse(),
    sessions: (["NYAM", "NYPM", "LON", "ASIA", "OTHER"] as Session[]).map((s) => ({ key: s, ...tally(ts.filter((t) => t.session === s)) })).filter((s) => s.n || s.key !== "OTHER"),
    hours: [...hours].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ key: `${k}:00`, ...tally(v) })),
    weekdays: DAYS.map((d, i) => ({ key: d, ...tally(ts.filter((t) => weekdayIndex(dayKey(t.entryAt, tz)) === i)) })).filter((d) => d.n),
    dirs: (["LONG", "SHORT"] as const).map((d) => ({ key: d, ...tally(ts.filter((t) => t.dir === d)) })),
    accounts: [...group(ts, (t) => t.account ?? "—")].map(([k, v]) => ({ key: k, ...tally(v) })),
    holds: HOLD_BUCKETS.map(([max, label], i) => {
      const lo = i ? HOLD_BUCKETS[i - 1]![0] : 0;
      return { key: label, ...tally(ts.filter((t) => { const m = holdMins(t); return m !== null && m >= lo && m < max; })) };
    }),
    hold: (() => {
      const all = ts.map(holdMins).filter((m): m is number => m !== null);
      const win = ts.filter((t) => t.pnl > 0).map(holdMins).filter((m): m is number => m !== null);
      const loss = ts.filter((t) => t.pnl < 0).map(holdMins).filter((m): m is number => m !== null);
      return { n: all.length, avg: avg(all), median: median(all), longest: all.length ? Math.max(...all) : null, avgWin: avg(win), avgLoss: avg(loss) };
    })(),
  };
}
