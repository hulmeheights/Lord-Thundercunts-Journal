import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGoal, describeMeasure, legacyMeasure, type GoalMeasure } from "../lib/analytics/goalcheck";
import type { LedgerEntry } from "../lib/analytics/ledger";
import type { Trade, TradingRules } from "../lib/types";

let seq = 0;
const trade = (day: string, hhmm: string, net: number, qty = 3): Trade => ({
  id: `g${++seq}`, source: "import", accountId: null, symbol: "MNQZ6", root: "MNQ", direction: "long", qty, maxPosition: qty,
  entryTime: `${day}T${hhmm}:00Z`, exitTime: `${day}T${hhmm}:00Z`, entryPrice: 1, exitPrice: 2, grossPnl: net, fees: 0, netPnl: net, pointValue: 2,
  fillCount: 2, setups: [], tags: [], mistakes: [], emotion: null, rating: null, grade: null, notes: null, plannedRisk: null, followedPlan: null, chartUrl: null,
});
const yours = { maxTradesPerDay: 5, maxDailyLoss: null, stopAfterConsecutiveLosses: null, maxContracts: null, maxLossPerTrade: null, cooldownMinutesAfterLoss: null, sessionStart: "14:30", sessionEnd: "16:00", defaultRisk: 300, custom: [] } as TradingRules;
const ctx = (trades: Trade[], today: string, ledger: LedgerEntry[] = []) => ({ trades, ledger, rules: yours, tz: "UTC", today });
const windowTwoWeeks: GoalMeasure = { kind: "days", rules: [{ type: "window", start: "14:30", end: "16:00" }], span: "weeks", n: 2 };

test("only 14:30–16:00 for two weeks: going, reached after the last day, broken by one early entry", () => {
  assert.equal(describeMeasure(windowTwoWeeks), "Only enter 14:30–16:00 for 2 weeks");
  const clean = [trade("2026-10-26", "14:35", 200), trade("2026-10-28", "15:10", -120), trade("2026-11-03", "14:31", 300)];
  const mid = checkGoal(windowTwoWeeks, "2026-10-26", null, ctx(clean, "2026-11-03"));
  assert.equal(mid.status, "going");
  assert.equal(mid.headline, "Day 9 of 14 · no breaks");
  assert.equal(mid.marks.length, 3);
  const done = checkGoal(windowTwoWeeks, "2026-10-26", null, ctx(clean, "2026-11-09"));
  assert.equal(done.status, "reached");
  assert.equal(done.reachedOn, "2026-11-09");
  const early = checkGoal(windowTwoWeeks, "2026-10-26", null, ctx([...clean, trade("2026-10-29", "13:13", -216)], "2026-11-03"));
  assert.equal(early.status, "broken");
  assert.match(early.detail!, /1 entry outside 14:30–16:00/);
  // Trades after the two weeks don't count against it.
  assert.equal(checkGoal(windowTwoWeeks, "2026-10-26", null, ctx([...clean, trade("2026-11-09", "09:00", 50)], "2026-11-10")).status, "reached");
});

test("days in a row reset on a break; days in total don't", () => {
  const rules = [{ type: "maxTrades" as const, n: 2 }, { type: "maxDayLoss" as const, amount: 400 }];
  const t = [
    trade("2026-10-19", "14:40", 100),
    trade("2026-10-20", "14:40", -500), // lost too much
    trade("2026-10-21", "14:40", 100),
    trade("2026-10-22", "14:40", 100),
    trade("2026-10-22", "14:50", 100),
    trade("2026-10-22", "15:00", 100), // three trades
    trade("2026-10-23", "14:40", 100),
  ];
  const row = checkGoal({ kind: "days", rules, span: "inARow", n: 3 }, "2026-10-19", null, ctx(t, "2026-10-23"));
  assert.equal(row.status, "going");
  assert.equal(row.headline, "1 / 3 in a row");
  assert.match(row.detail!, /3 trades \(limit 2\)/);
  const total = checkGoal({ kind: "days", rules, span: "total", n: 3 }, "2026-10-19", null, ctx(t, "2026-10-23"));
  assert.equal(total.status, "reached");
  assert.equal(total.reachedOn, "2026-10-23");
  // Out of time once the "by when" date passes.
  assert.equal(checkGoal({ kind: "days", rules, span: "inARow", n: 3 }, "2026-10-19", "2026-10-22", ctx(t, "2026-10-23")).status, "broken");
});

test("numbers reached since the start, from trades and the ledger", () => {
  const t = [trade("2026-10-01", "14:40", 5000), trade("2026-10-20", "14:40", 900), trade("2026-10-21", "14:40", 1200)];
  const net = checkGoal({ kind: "total", metric: "net", target: 2000 }, "2026-10-20", null, ctx(t, "2026-10-22"));
  assert.equal(net.status, "reached");
  assert.equal(net.reachedOn, "2026-10-21");
  const ledger = [{ id: "l1", day: "2026-10-21", kind: "payout", amount: 1500, firm: "Lucid", note: null, qty: 1 }] as unknown as LedgerEntry[];
  const paid = checkGoal({ kind: "total", metric: "paidOut", target: 2000 }, "2026-10-20", null, ctx(t, "2026-10-22", ledger));
  assert.equal(paid.status, "going");
  assert.equal(paid.progress, 0.75);
});

test("rates decide after the next N trades", () => {
  const t = [trade("2026-10-20", "14:40", 100), trade("2026-10-20", "14:50", -100), trade("2026-10-21", "14:40", 100), trade("2026-10-21", "14:50", 100)];
  assert.equal(checkGoal({ kind: "rate", metric: "winRate", target: 60, over: 5 }, "2026-10-20", null, ctx(t, "2026-10-21")).status, "going");
  assert.equal(checkGoal({ kind: "rate", metric: "winRate", target: 60, over: 4 }, "2026-10-20", null, ctx(t, "2026-10-21")).status, "reached");
  assert.equal(checkGoal({ kind: "rate", metric: "winRate", target: 80, over: 4 }, "2026-10-20", null, ctx(t, "2026-10-21")).status, "broken");
});

test("old clean-day goals read as keep-all-my-rules on N days", () => {
  const m = legacyMeasure(2)!;
  const t = [trade("2026-10-20", "14:40", 100), trade("2026-10-21", "13:00", 100), trade("2026-10-22", "14:40", 100)];
  const p = checkGoal(m, "2026-10-20", null, ctx(t, "2026-10-22"));
  assert.equal(p.status, "reached");
  assert.equal(p.marks.filter((d) => !d.ok)[0]!.why[0], "outside your window");
});

test("rules kept until an exact date", () => {
  const m: GoalMeasure = { kind: "days", rules: [{ type: "window", start: "14:30", end: "16:00" }], span: "until", n: 1, until: "2026-11-07" };
  assert.equal(describeMeasure(m), "Only enter 14:30–16:00 until Sat 7 Nov");
  const t = [trade("2026-10-26", "14:35", 200)];
  assert.equal(checkGoal(m, "2026-10-26", null, ctx(t, "2026-11-01")).headline, "Day 7 of 13 · no breaks");
  assert.equal(checkGoal(m, "2026-10-26", null, ctx(t, "2026-11-08")).status, "reached");
});
