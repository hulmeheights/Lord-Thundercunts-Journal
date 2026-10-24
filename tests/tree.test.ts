import { test } from "node:test";
import assert from "node:assert/strict";
import { growFlight } from "../lib/analytics/tree";
import { cleanDaysSince, missionDays, missionState } from "../lib/analytics/mission";
import type { Trade, TradingRules } from "../lib/types";

test("flight: the rocket climbs with altitude, worlds behind for goals reached, ahead for goals open, the destination grows", () => {
  const stages = [
    { id: "goal_a", done: true },
    { id: "goal_b", done: false },
  ];
  const low = growFlight(stages, 3);
  const high = growFlight(stages, 60);
  assert.ok(high.rocket.y < low.rocket.y);
  assert.deepEqual(high.worlds.map((w) => w.done), [true, false]);
  const behind = high.worlds.find((w) => w.done)!;
  const ahead = high.worlds.find((w) => !w.done)!;
  assert.ok(behind.y > high.rocket.y && ahead.y < high.rocket.y);
  assert.ok(growFlight([{ id: "a", done: true }], 0).destination.r > growFlight([{ id: "a", done: false }], 0).destination.r);
  assert.ok(growFlight(stages, 100000).rocket.y > high.destination.y); // never flies past the destination
  assert.deepEqual(growFlight(stages, 20), growFlight(stages, 20));
});

let seq = 0;
const trade = (day: string, hhmm: string, net: number): Trade => ({
  id: `m${++seq}`, source: "import", accountId: null, symbol: "MNQZ6", root: "MNQ", direction: "long", qty: 3, maxPosition: 3,
  entryTime: `${day}T${hhmm}:00Z`, exitTime: `${day}T${hhmm}:00Z`, entryPrice: 1, exitPrice: 2, grossPnl: net, fees: 0, netPnl: net, pointValue: 2,
  fillCount: 2, setups: [], tags: [], mistakes: [], emotion: null, rating: null, notes: null, plannedRisk: null, followedPlan: null, chartUrl: null,
});
const rules = { maxTradesPerDay: 3, maxDailyLoss: 1000, stopAfterConsecutiveLosses: 2, maxContracts: null, maxLossPerTrade: null, cooldownMinutesAfterLoss: null, sessionStart: "14:30", sessionEnd: "16:00", defaultRisk: 300, custom: [] } as unknown as TradingRules;

test("mission: in-window days burn, sat-out weekdays hold, early or over-limit days leak, weekends skipped", () => {
  const trades = [
    trade("2026-10-20", "14:40", 300), // Tue: clean
    trade("2026-10-22", "14:45", 200), // Thu: clean
    trade("2026-10-23", "13:13", -216), // Fri: before the window
    trade("2026-10-23", "14:50", 300),
  ];
  const days = missionDays(trades, rules, "UTC", "2026-10-19", "2026-10-26");
  assert.deepEqual(days.map((d) => [d.day, d.kind]), [
    ["2026-10-19", "hold"],
    ["2026-10-20", "burn"],
    ["2026-10-21", "hold"],
    ["2026-10-22", "burn"],
    ["2026-10-23", "leak"],
    ["2026-10-26", "hold"],
  ]);
  assert.deepEqual(days[4]!.reasons, ["outside your window"]);
  const s = missionState(days, 2, 1);
  assert.equal(s.streak, 0); // Monday's hold keeps nothing going past Friday's leak
  assert.equal(s.altitude, 1 + 3 + 1 + 3 - 2 + 1 + 2 + 5);
  assert.equal(missionState(days.slice(0, 4), 0, 0).streak, 2);
  assert.equal(cleanDaysSince(days, "2026-10-21"), 1);
});
