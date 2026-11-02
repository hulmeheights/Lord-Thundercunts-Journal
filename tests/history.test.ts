import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv } from "../lib/import/csv";
import { historyStats, parseTradingView, tally } from "../lib/bot/history";

const tv = readFileSync(new URL("./fixtures-tv-list-of-trades.csv", import.meta.url), "utf8");

test("TradingView list of trades: pairs entries with exits, finds the chart's timezone", () => {
  const r = parseTradingView(parseCsv(tv), ["Europe/London"]);
  assert.equal(r.error, undefined);
  assert.equal(r.tz, "Europe/London");
  assert.equal(r.trades.length, 13);
  const first = r.trades[0]!;
  assert.equal(first.dir, "SHORT");
  assert.equal(first.session, "ASIA");
  assert.equal(first.entryAt, "2026-10-19T01:27:00.000Z"); // 02:27 London (BST) = 21:27 New York
  assert.equal(first.pnl, -236.2);
  // Every trade's time falls in the session its signal names.
  assert.ok(r.trades.every((t) => t.signal && t.signal.toUpperCase().replace(" ", "").includes(t.session === "NYAM" ? "NYAM" : t.session === "NYPM" ? "NYPM" : t.session)));
  // Even guessing New York first, the sessions put it back on London.
  assert.equal(parseTradingView(parseCsv(tv), ["America/New_York"]).tz, "Europe/London");
});

test("the same export twice gives the same keys (so repeats are ignored)", () => {
  const a = parseTradingView(parseCsv(tv), ["Europe/London"]).trades.map((t) => t.key);
  const b = parseTradingView(parseCsv(tv), ["Europe/London"]).trades.map((t) => t.key);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

test("a re-export with re-rounded prices is still the same trade", () => {
  const a = "Trade number,Type,Date and time,Signal,Price USD,Size (qty),Net PnL USD\n1,Exit long,2026-10-19 19:45,Exit Long NYPM,29777.25,5,386.3\n1,Entry long,2026-10-19 19:36,Long NYPM,29738,5,386.3\n";
  const b = a.replace("29738,", "29738.25,").replace(/^1,/gm, "7,");
  assert.equal(parseTradingView(parseCsv(a), ["Europe/London"]).trades[0]!.key, parseTradingView(parseCsv(b), ["Europe/London"]).trades[0]!.key);
});

test("an open trade at the end of the export is left out", () => {
  const csv = "Trade number,Type,Date and time,Signal,Price USD,Size (qty),Net PnL USD\n1,Exit long,2026-10-19 19:45,Open,29777.25,5,386.3\n1,Entry long,2026-10-19 19:36,Long NYPM,29738,5,386.3\n";
  const r = parseTradingView(parseCsv(csv), ["Europe/London"]);
  assert.equal(r.trades.length, 0);
  assert.equal(r.open, 1);
});

test("stats: win rate, profit factor, by session and over time", () => {
  const r = parseTradingView(parseCsv(tv), ["Europe/London"]);
  const s = historyStats(r.trades, "Europe/London");
  assert.equal(s.all.n, 13);
  assert.equal(s.over.cumulative.length, 13);
  assert.equal(s.sessions.reduce((a, x) => a + x.n, 0), 13);
  assert.equal(s.hours.reduce((a, x) => a + x.n, 0), 13);
  assert.deepEqual(tally([{ pnl: 100 }, { pnl: -50 }]), { n: 2, won: 1, winRate: 0.5, net: 50, pf: 2, avgWin: 100, avgLoss: -50 });
});
