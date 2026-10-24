import { test } from "node:test";
import assert from "node:assert/strict";
import { queryTrades, TradeQuery } from "../lib/analytics/query";
import type { Trade, TradingRules } from "../lib/types";

let seq = 0;
const trade = (day: string, hhmm: string, net: number, setups: string[] = []): Trade => ({
  id: `q${++seq}`, source: "import", accountId: null, symbol: "MNQZ6", root: "MNQ", direction: "long", qty: 3, maxPosition: 3,
  entryTime: `${day}T${hhmm}:00Z`, exitTime: `${day}T${hhmm}:00Z`, entryPrice: 1, exitPrice: 2, grossPnl: net, fees: 0, netPnl: net, pointValue: 2,
  fillCount: 2, setups, tags: [], mistakes: [], emotion: null, rating: null, notes: null, plannedRisk: null, followedPlan: null, chartUrl: null,
});
const rules = { maxTradesPerDay: null, maxDailyLoss: null, stopAfterConsecutiveLosses: null, maxContracts: null, maxLossPerTrade: null, cooldownMinutesAfterLoss: null, sessionStart: "14:30", sessionEnd: "16:00", defaultRisk: 300, custom: [] } as TradingRules;

const log = [
  trade("2026-10-20", "14:12", -200),
  trade("2026-10-20", "14:33", 1402.5, ["VAL"]),
  trade("2026-10-21", "14:41", 300, ["VAL", "FVG"]),
  trade("2026-10-21", "14:52", -150),
  trade("2026-10-22", "15:20", 90),
  trade("2026-10-22", "16:05", -300),
];

test("15-minute entry buckets inside 14:00–16:00, with the best-trade check", () => {
  const r = queryTrades(log, TradeQuery.parse({ entryFrom: "14:00", entryTo: "16:00", groupBy: "entryMinutes", bucketMinutes: 15 }), rules, "UTC");
  assert.equal(r.matched.trades, 5);
  assert.deepEqual(r.groups!.map((g) => [g.key, g.trades, g.net]), [
    ["14:00–14:15", 1, -200],
    ["14:30–14:45", 2, 1702.5],
    ["14:45–15:00", 1, -150],
    ["15:15–15:30", 1, 90],
  ]);
  assert.equal(r.groups![1]!.netWithoutBest, 300);
});

test("filters by setup and rule breaks, and lists trades", () => {
  assert.equal(queryTrades(log, TradeQuery.parse({ setup: "val" }), rules, "UTC").matched.trades, 2);
  const broke = queryTrades(log, TradeQuery.parse({ ruleBreaks: "only", listTrades: true }), rules, "UTC");
  assert.deepEqual(broke.trades!.map((t) => t.entry), ["2026-10-22 16:05", "2026-10-20 14:12"]);
  const bySetup = queryTrades(log, TradeQuery.parse({ groupBy: "setup" }), rules, "UTC");
  assert.ok(bySetup.groups!.some((g) => g.key === "FVG" && g.trades === 1));
});
