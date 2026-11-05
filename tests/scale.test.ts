import { test } from "node:test";
import assert from "node:assert/strict";
import { measureEdge, simulateAccountYear } from "../lib/analytics/scale";
import type { Trade } from "../lib/types";

const t = (i: number, pnl: number, grade: string | null = "A+", hour = 14): Trade =>
  ({
    id: `t${i}`, source: "import", accountId: "a1", symbol: "MNQ", root: "MNQ", direction: "long", qty: 1, maxPosition: 1,
    entryTime: new Date(Date.UTC(2026, 9, 1 + Math.floor(i / 2), hour, 35)).toISOString(), exitTime: new Date(Date.UTC(2026, 9, 1 + Math.floor(i / 2), hour, 50)).toISOString(),
    entryPrice: 1, exitPrice: 1, grossPnl: pnl, fees: 0, netPnl: pnl, pointValue: 2, fillCount: 2, setups: [], tags: [], mistakes: [],
    emotion: null, rating: null, grade, notes: null, plannedRisk: 200, followedPlan: null, chartUrl: null,
  }) as Trade;

test("edge in R, filtered to the window and the grades", () => {
  // 40% win at +2R, 60% lose at -1R: +0.2R a trade, PF 1.33
  const trades = Array.from({ length: 50 }, (_, i) => t(i, i % 5 < 2 ? 400 : -200, i % 10 === 9 ? "C" : "A+", i === 49 ? 10 : 14));
  const all = measureEdge(trades, null, "UTC", { window: null, grades: null });
  assert.equal(all.n, 50);
  assert.ok(Math.abs(all.expectancyR! - 0.2) < 1e-9);
  const aplus = measureEdge(trades, null, "UTC", { window: { start: 14 * 60, end: 16 * 60 }, grades: ["A+"] });
  assert.equal(aplus.n, 45); // the 5 C trades left out (the 10:35 one is also a C)
  assert.equal(all.ready.checks[0]!.ok, true);
});

test("the year simulation is repeatable, and a losing edge never projects a profit", () => {
  const good = measureEdge(Array.from({ length: 60 }, (_, i) => t(i, i % 5 < 2 ? 400 : -200)), null, "UTC", { window: null, grades: null });
  const a = simulateAccountYear(good, { risk: 150, sims: 300 });
  const b = simulateAccountYear(good, { risk: 150, sims: 300 });
  assert.deepEqual(a, b);
  assert.ok(a!.median > 0);
  const bad = measureEdge(Array.from({ length: 60 }, (_, i) => t(i, i % 5 < 1 ? 300 : -200)), null, "UTC", { window: null, grades: null });
  const c = simulateAccountYear(bad, { risk: 150, sims: 300 });
  assert.ok(c!.median <= 0);
  assert.ok(c!.bustChance > 0.5);
});

test("a trade copied to several accounts counts once", () => {
  const base = Array.from({ length: 20 }, (_, i) => t(i, i % 5 < 2 ? 400 : -200));
  const copies = base.map((x) => ({ ...x, id: `${x.id}c`, accountId: "a2" }));
  const e = measureEdge([...base, ...copies], null, "UTC", { window: null, grades: null });
  assert.equal(e.n, 20);
  assert.equal(e.copiesFolded, 20);
});
