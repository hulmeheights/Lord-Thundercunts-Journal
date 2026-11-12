import { test } from "node:test";
import assert from "node:assert/strict";
import { accountDone, accountStats, dayGoal, filtersApply, passTradingDay, plan, stageRules, type Card, type Signal } from "../lib/pass/rules";

const sig = (o: Partial<Signal> = {}): Signal => ({ session: "NY", tradingDay: "2026-11-12", dir: "LONG", price: 25000, bias: "UP", vah: 24990, val: 24950, ...o });
const evalD: Card = { firm: "topstep", stage: "eval", script: "D", dll: true, contracts: 10 };
const fresh = (days: { day: string; pnl: number }[] = [], today = "2026-11-12", stage: "eval" | "funded" = "eval") => accountStats(days, today, undefined, stageRules("topstep", stage));

test("Topstep eval, fresh account: $1,000 risk = 50 points on 10 MNQ, target the $1,640 day cap", () => {
  const p = plan(evalD, fresh(), sig());
  assert.ok(p.take);
  if (!p.take) return;
  assert.equal(p.stopPts, 50);
  assert.equal(p.stopTicks, 200);
  assert.equal(p.targetPts, 82.5); // $1,640 + $10 costs on 10 MNQ
  assert.equal(p.targetTicks, 330);
});

test("eval goal = the smaller of the cap and what's needed (incl. the 55% consistency rule)", () => {
  const r = stageRules("topstep", "eval");
  assert.equal(Math.round(dayGoal("eval", r, fresh([{ day: "2026-11-10", pnl: 2000 }]))), 1636); // best 2,000 / 0.55 - 2,000 beats 3,000 - 2,000
  assert.equal(dayGoal("eval", r, fresh([{ day: "2026-11-10", pnl: 1000 }])), 1640); // 2,000 needed, capped at 1,640
  // Best day 1,640 needs total 2,981.8 → 3000 - 2,640 = 360 vs 1640/0.55 - 2640 = 341.8 → 360
  assert.equal(dayGoal("eval", r, fresh([{ day: "2026-11-10", pnl: 1640 }, { day: "2026-11-11", pnl: 1000 }])), 360);
  // Big best day: 1,640 then -500 → needed = max(1,860, 1640/0.55 - 1140 = 1,841.8) → capped 1,640
  assert.equal(dayGoal("eval", r, fresh([{ day: "2026-11-10", pnl: 1640 }, { day: "2026-11-11", pnl: -500 }])), 1640);
});

test("the day stops at the goal, at the daily loss limit, and under $25 of room", () => {
  assert.match((plan(evalD, fresh([{ day: "2026-11-12", pnl: 1640 }]), sig()) as { reason: string }).reason, /goal reached/);
  assert.match((plan(evalD, fresh([{ day: "2026-11-12", pnl: -1000 }]), sig()) as { reason: string }).reason, /daily loss limit/);
  // After a $990 loss today only $10 of the $1,000 daily limit is left.
  assert.match((plan(evalD, fresh([{ day: "2026-11-12", pnl: -990 }]), sig()) as { reason: string }).reason, /less than \$25/);
  // $600 lost today: risk shrinks to the $400 left (20 points), target = goal left ($2,240 → capped by goal 1,640 + 600).
  const p = plan(evalD, fresh([{ day: "2026-11-12", pnl: -600 }]), sig());
  assert.ok(p.take && p.stopPts === 20 && p.targetPts === 112.5);
});

test("script D: no filters in eval, both filters once funded; script C: always", () => {
  assert.equal(filtersApply("D", "eval"), false);
  assert.equal(filtersApply("D", "funded"), true);
  assert.equal(filtersApply("C", "eval"), true);
  const against = sig({ bias: "DOWN" });
  assert.ok(plan(evalD, fresh(), against).take);
  assert.match((plan({ ...evalD, script: "C" }, fresh(), against) as { reason: string }).reason, /4H bias/);
  const inside = sig({ price: 24970 });
  assert.match((plan({ ...evalD, stage: "funded" }, fresh([], "2026-11-12", "funded"), inside) as { reason: string }).reason, /inside the value area/);
  assert.ok(plan({ ...evalD, stage: "funded" }, fresh([], "2026-11-12", "funded"), sig({ price: 24940, dir: "LONG" })).take); // below VAL, bias up
});

test("funded: $750 risk (37.5 pt), $2,500 cap; after 5 winning days the goal shrinks to what's left to $8,000; then payout", () => {
  const funded: Card = { ...evalD, stage: "funded" };
  const p = plan(funded, fresh([], "2026-11-20", "funded"), sig({ tradingDay: "2026-11-20" }));
  assert.ok(p.take && p.stopPts === 37.5 && p.targetPts === 125.5);
  const five = [1, 2, 3, 4, 5].map((i) => ({ day: `2026-11-1${i}`, pnl: 1400 }));
  const s = fresh(five, "2026-11-20", "funded");
  assert.equal(s.winDaysBefore, 5);
  assert.equal(dayGoal("funded", stageRules("topstep", "funded"), s), 1000); // 8,000 - 7,000
  const done = accountDone("funded", stageRules("topstep", "funded"), fresh([...five, { day: "2026-11-20", pnl: 1000 }], "2026-11-21", "funded"));
  assert.equal(done?.kind, "payout");
});

test("passed needs the target AND the consistency rule; blown at the trailing limit", () => {
  const r = stageRules("topstep", "eval");
  assert.equal(accountDone("eval", r, fresh([{ day: "2026-11-10", pnl: 1640 }, { day: "2026-11-11", pnl: 1400 }]))?.kind, "passed");
  assert.equal(accountDone("eval", r, fresh([{ day: "2026-11-10", pnl: 1800 }, { day: "2026-11-11", pnl: 1300 }])), null); // 1,800 > 55% of 3,100
  // Up 1,500 at the close, then -2,000: the limit trailed to -500.
  assert.equal(accountDone("eval", r, fresh([{ day: "2026-11-10", pnl: 1500 }, { day: "2026-11-11", pnl: -2000 }]))?.kind, "blown");
  // Lucid step 1: 40% rule.
  const l = stageRules("lucid", "eval");
  assert.equal(accountDone("eval", l, accountStats([{ day: "2026-11-10", pnl: 1200 }, { day: "2026-11-11", pnl: 1200 }, { day: "2026-11-12", pnl: 700 }], "2026-11-13", undefined, l))?.kind, "passed");
});

test("no Asia trade for the weekend; the trading day rolls at 18:00 New York", () => {
  assert.match((plan(evalD, fresh([], "2026-11-14"), sig({ tradingDay: "2026-11-14", session: "ASIA" })) as { reason: string }).reason, /weekend/);
  assert.equal(passTradingDay(new Date("2026-11-13T01:30:00Z")), "2026-11-13"); // Thu 20:30 NY → Friday
  assert.equal(passTradingDay(new Date("2026-11-12T15:30:00Z")), "2026-11-12");
});

test("a few dollars short: the day cap stops the day, but the last bit to a pass still trades (and covers its costs)", () => {
  // +$1,630 today (target net of costs): $10 left of the $1,640 cap → done for the day.
  assert.match((plan(evalD, fresh([{ day: "2026-11-12", pnl: 1630 }]), sig()) as { reason: string }).reason, /goal reached/);
  // $2,990 made, $10 to pass: aim for $25 + $10 costs = 1.75 pt on 10 MNQ.
  const p = plan(evalD, fresh([{ day: "2026-11-10", pnl: 1630 }, { day: "2026-11-11", pnl: 1360 }]), sig());
  assert.ok(p.take && p.targetPts === 1.75);
});

test("script A never filters", () => {
  assert.equal(filtersApply("A", "eval"), false);
  assert.equal(filtersApply("A", "funded"), false);
});
