import { test } from "node:test";
import assert from "node:assert/strict";
import type { Trade, TradingRules } from "../lib/types";
import { summarize, dailySeries, byTradeNumber } from "../lib/analytics/stats";
import { evaluateRules } from "../lib/analytics/rules";
import { detectTilt } from "../lib/analytics/tilt";
import { runWhatIf } from "../lib/analytics/whatif";
import { propStatus, simulateProp } from "../lib/analytics/prop";
import { addDays, dayKey, startOfWeek, endOfMonth, weekdayIndex, minuteOfDay } from "../lib/analytics/time";

const TZ = "America/New_York";
let seq = 0;
function trade(day: string, hhmm: string, net: number, extra: Partial<Trade> = {}): Trade {
  seq++;
  // 14:00Z == 10:00 New York during DST.
  const [h, m] = hhmm.split(":").map(Number);
  const entry = new Date(`${day}T${String(h! + 4).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  const exit = new Date(entry.getTime() + 3 * 60_000);
  return {
    id: `x${seq}`, source: "sample", accountId: "acc", symbol: "MNQZ5", root: "MNQ", direction: "long",
    qty: 1, maxPosition: 1, entryTime: entry.toISOString(), exitTime: exit.toISOString(), entryPrice: 1, exitPrice: 1,
    grossPnl: net, fees: 0, netPnl: net, pointValue: 2, fillCount: 2, setups: [], tags: [], mistakes: [],
    emotion: null, rating: null, grade: null, notes: null, plannedRisk: null, followedPlan: null, chartUrl: null, ...extra,
  };
}

const RULES: TradingRules = {
  maxTradesPerDay: 3, maxDailyLoss: 300, stopAfterConsecutiveLosses: 2, maxContracts: 2, maxLossPerTrade: 250,
  cooldownMinutesAfterLoss: 5, sessionStart: "09:30", sessionEnd: "12:00", defaultRisk: 100, custom: [],
};

test("time helpers", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(startOfWeek("2026-10-14"), "2026-10-12");
  assert.equal(endOfMonth("2026-02-10"), "2026-02-28");
  assert.equal(weekdayIndex("2026-10-18"), 6);
  assert.equal(dayKey("2026-10-14T03:00:00Z", TZ), "2026-10-13");
  assert.equal(minuteOfDay("2026-10-14T13:30:00Z", TZ), 9 * 60 + 30);
});

test("summary math", () => {
  const s = summarize([trade("2026-10-14", "10:00", 200), trade("2026-10-14", "10:10", -100), trade("2026-10-14", "10:20", 100)]);
  assert.equal(s.trades, 3);
  assert.equal(s.net, 200);
  assert.equal(s.winRate, 2 / 3);
  assert.equal(s.profitFactor, 3);
  assert.equal(s.avgWin, 150);
  assert.equal(s.avgLoss, 100);
  assert.equal(s.maxDrawdown, 100);
  assert.equal(dailySeries([trade("2026-10-14", "10:00", 50), trade("2026-10-15", "10:00", -20)], TZ).at(-1)!.cum, 30);
});

test("rule engine flags exactly the trades that broke each rule", () => {
  const d = "2026-10-14";
  const ts = [
    trade(d, "09:00", 50), // outside window
    trade(d, "10:00", -100),
    trade(d, "10:02", -100), // cooldown break (re-entered 2m after loss... prev exit 10:03 → negative gap)
    trade(d, "10:30", -150), // after 2 losses in a row
    trade(d, "10:40", 40, { qty: 3, maxPosition: 3 }), // too many trades + oversize + after daily loss
  ];
  const r = evaluateRules(ts, RULES, TZ);
  const rules = new Set(r.violations.map((v) => v.rule));
  for (const k of ["session", "cooldown", "stopAfterLosses", "maxTrades", "maxContracts", "maxDailyLoss"]) {
    assert.ok(rules.has(k as never), `expected ${k}`);
  }
  assert.ok(!r.violatingTradeIds.has(ts[1]!.id));
  assert.ok(r.violatingTradeIds.has(ts[3]!.id));
});

test("tilt radar catches fast re-entry and size-up after a loss", () => {
  const d = "2026-10-14";
  const ts = [trade(d, "10:00", -100), trade(d, "10:04", -80, { qty: 2 }), trade(d, "11:00", 60)];
  const t = detectTilt(ts, TZ);
  // #2: fast re-entry + size-up (severity 2). #3: taken after 2 straight losses (severity 1).
  assert.equal(t.flaggedIds.size, 2);
  assert.equal(t.flags.find((f) => f.tradeId === ts[1]!.id)!.severity, 2);
  assert.equal(t.flags.find((f) => f.tradeId === ts[2]!.id)!.severity, 1);
  assert.equal(t.tiltCost, -20);
});

test("what-if replays sequential stops in order", () => {
  const d = "2026-10-14";
  const ts = [trade(d, "10:00", -100), trade(d, "10:10", -100), trade(d, "10:20", 500), trade("2026-10-15", "10:00", 50)];
  const r = runWhatIf(ts, { stopAfterLosses: 2 }, TZ);
  assert.equal(r.removedCount, 1);
  assert.equal(r.ghost.net, -150);
  assert.equal(r.delta, -500);
  assert.equal(byTradeNumber(ts, TZ).find((b) => b.key === "3")!.net, 500);
});

test("prop status trails end-of-day and Monte Carlo is deterministic", () => {
  const prop = {
    enabled: true, firm: "Topstep", preset: "50K" as const, phase: "combine" as const, startBalance: 50000,
    profitTarget: 3000, maxLossLimit: 2000, dailyLossLimit: 1000, consistencyPct: 50, maxContracts: 5,
    startDate: "2026-01-01", accountIds: [],
  };
  const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12"];
  const ts = days.map((d, i) => trade(d, "10:00", i % 3 === 2 ? -300 : 600));
  const st = propStatus(ts, prop, TZ);
  assert.equal(st.profit, 4 * 600 - 2 * 300);
  assert.equal(st.highWater, 50000 + 600 + 600 - 300 + 600 + 600);
  assert.equal(st.floor, Math.min(st.highWater - 2000, 50000));
  const a = simulateProp(st, prop, { sims: 500, seed: 7 });
  const b = simulateProp(st, prop, { sims: 500, seed: 7 });
  assert.ok(a && b);
  assert.equal(a.passProb, b.passProb);
  assert.ok(Math.abs(a.passProb + a.bustProb + a.openProb - 1) < 1e-9);
});

import { riskFor, rMultiple as rOf } from "../lib/analytics/stats";

test("risk: a loss counts as what was risked unless you typed a risk", () => {
  const base = { plannedRisk: null as number | null };
  assert.equal(riskFor({ ...base, netPnl: -248 }, 500), 248);
  assert.equal(riskFor({ ...base, netPnl: 600 }, 500), 500);
  assert.equal(riskFor({ ...base, netPnl: 600 }, null), null);
  assert.equal(riskFor({ plannedRisk: 300, netPnl: -248 }, 500), 300);
  assert.equal(rOf({ ...base, netPnl: -248 } as never, 500), -1);
});

test("R: each account's usual full loss is 1R, so a scratch is a sliver of R and a full stop is −1R", async () => {
  const { summarize, usualRisks } = await import("../lib/analytics/stats");
  const mk = (i: number, acct: string, net: number) =>
    ({ id: `r${i}`, source: "import", accountId: acct, symbol: "MNQZ6", root: "MNQ", direction: "long", qty: 1, maxPosition: 1, entryTime: `2026-10-2${i % 7}T14:30:00Z`, exitTime: `2026-10-2${i % 7}T14:40:00Z`, entryPrice: 1, exitPrice: 2, grossPnl: net, fees: 0, netPnl: net, pointValue: 2, fillCount: 2, setups: [], tags: [], mistakes: [], emotion: null, rating: null, grade: null, notes: null, plannedRisk: null, followedPlan: null, chartUrl: null }) as never;
  // A $300-risk account: full stops of $300, one $20 scratch, wins of $600.
  const small = [mk(1, "a", -300), mk(2, "a", -300), mk(3, "a", -20), mk(4, "a", 600), mk(5, "a", 600)];
  // The same trades copied at 2× on a heavy account.
  const big = [mk(6, "b", -600), mk(7, "b", -600), mk(8, "b", -40), mk(9, "b", 1200), mk(10, "b", 1200)];
  assert.deepEqual([...usualRisks([...small, ...big])], [["a", 300], ["b", 600]]);
  // (−1 −1 −0.067 +2 +2) / 5 ≈ +0.39R on both accounts: the scratch no longer counts as a full −1R.
  assert.equal(summarize([...small, ...big], 300).avgR!.toFixed(2), "0.39");
  assert.equal(summarize([...small, ...big], 300).avgWinR, 2);
  // Risk : reward is the average winner in R: 1 : 2.
});

test("R: a 1R you set for an account beats the worked-out one", async () => {
  const { summarize } = await import("../lib/analytics/stats");
  const mk = (i: number, net: number) =>
    ({ id: `s${i}`, source: "import", accountId: "heavy", symbol: "MNQZ6", root: "MNQ", direction: "long", qty: 1, maxPosition: 1, entryTime: `2026-10-2${i}T14:30:00Z`, exitTime: `2026-10-2${i}T14:40:00Z`, entryPrice: 1, exitPrice: 2, grossPnl: net, fees: 0, netPnl: net, pointValue: 2, fillCount: 2, setups: [], tags: [], mistakes: [], emotion: null, rating: null, grade: null, notes: null, plannedRisk: null, followedPlan: null, chartUrl: null }) as never;
  const ts = [mk(1, -400), mk(2, -400), mk(3, -400), mk(4, 1200)];
  // Worked out: 1R = $400, so the win is +3R. Set by hand to $600: the losses are −0.67R and the win +2R.
  assert.equal(summarize(ts, 300).avgWinR, 3);
  assert.equal(summarize(ts, { defaultRisk: 300, accountRisk: { heavy: 600 } }).avgWinR, 2);
});
