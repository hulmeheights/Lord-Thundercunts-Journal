import { test } from "node:test";
import assert from "node:assert/strict";
import { marketShift, windowFor } from "../lib/analytics/time";
import { evaluateRules } from "../lib/analytics/rules";
import { checkGoal } from "../lib/analytics/goalcheck";
import { clockChange } from "../lib/analytics/notify";
import type { Trade, TradingRules } from "../lib/types";

const LDN = "Europe/London";

test("New York's open on a UK clock: an hour early in the out-of-step weeks only", () => {
  assert.equal(marketShift("2026-10-23", LDN), 0); // both on summer time
  assert.equal(marketShift("2026-10-26", LDN), -60); // UK back on GMT, US still on EDT
  assert.equal(marketShift("2026-10-30", LDN), -60);
  assert.equal(marketShift("2026-11-02", LDN), 0); // US back on EST
  assert.equal(marketShift("2026-03-10", LDN), -60); // US springs forward first (8 Mar)
  assert.equal(marketShift("2026-03-30", LDN), 0); // UK catches up (29 Mar)
  assert.equal(marketShift("2026-10-26", "America/New_York"), 0);
  const rules = { sessionStart: "14:30", sessionEnd: "16:00", followMarket: true };
  assert.deepEqual(windowFor(rules, "2026-10-27", LDN), { start: 13 * 60 + 30, end: 15 * 60, shift: -60 });
  assert.deepEqual(windowFor({ ...rules, followMarket: false }, "2026-10-27", LDN), { start: 14 * 60 + 30, end: 16 * 60, shift: 0 });
});

let seq = 0;
// Times are given in UTC: this week London is on GMT, so UTC = UK clock time.
const trade = (iso: string, net: number): Trade => ({
  id: `c${++seq}`, source: "import", accountId: null, symbol: "MNQZ6", root: "MNQ", direction: "long", qty: 1, maxPosition: 1,
  entryTime: iso, exitTime: iso, entryPrice: 1, exitPrice: 2, grossPnl: net, fees: 0, netPnl: net, pointValue: 2,
  fillCount: 2, setups: [], tags: [], mistakes: [], emotion: null, rating: null, notes: null, plannedRisk: null, followedPlan: null, chartUrl: null,
});
const base = { maxTradesPerDay: null, maxDailyLoss: null, stopAfterConsecutiveLosses: null, maxContracts: null, maxLossPerTrade: null, cooldownMinutesAfterLoss: null, sessionStart: "14:30", sessionEnd: "16:00", defaultRisk: 300, custom: [] } as TradingRules;

test("a 13:40 entry this week is inside the window when it follows New York", () => {
  const t = [trade("2026-10-27T13:40:00Z", 200)];
  assert.equal(evaluateRules(t, { ...base, followMarket: true }, LDN).violations.length, 0);
  const fixed = evaluateRules(t, { ...base, followMarket: false }, LDN).violations;
  assert.equal(fixed.length, 1);
  // And a 14:45 entry is fine on a normal week either way.
  assert.equal(evaluateRules([trade("2026-11-03T14:45:00Z", 100)], { ...base, followMarket: true }, LDN).violations.length, 0);
});

test("the two-week 14:30–16:00 goal keeps counting through the clock change", () => {
  const goal = { kind: "days" as const, rules: [{ type: "window" as const, start: "14:30", end: "16:00" }], span: "weeks" as const, n: 2 };
  const trades = [trade("2026-10-26T13:35:00Z", 150), trade("2026-10-29T14:50:00Z", -90), trade("2026-11-02T14:40:00Z", 200)];
  const ctx = { trades, ledger: [], rules: { ...base, followMarket: true }, tz: LDN, today: "2026-11-03" };
  const p = checkGoal(goal, "2026-10-26", null, ctx);
  assert.equal(p.status, "going");
  assert.deepEqual(p.marks.map((m) => m.ok), [true, true, true]);
  // 14:50 on 29 Oct is after this week's 15:00 close? No: it's before 15:00, so it's in. 15:10 would not be.
  const late = checkGoal(goal, "2026-10-26", null, { ...ctx, trades: [...trades, trade("2026-10-28T15:10:00Z", 50)] });
  assert.equal(late.status, "broken");
  assert.match(late.detail!, /outside 13:30–15:00/);
});

test("one heads-up on 31 October: back to 14:30–16:00 from 1 November", () => {
  const today = windowFor({ ...base, followMarket: true }, "2026-10-31", LDN).shift;
  const next = windowFor({ ...base, followMarket: true }, "2026-11-01", LDN);
  const r = clockChange({ day: "2026-10-31", minute: 10 * 60 + 15, today, next })!;
  assert.equal(r.title, "Back to 14:30–16:00 from 1 Nov");
  assert.match(r.body, /From Sunday 1 November you trade 14:30–16:00 again/);
  assert.equal(r.key, "2026-10-31");
  // Not on other days, and not outside 10:00–11:00.
  const t30 = windowFor({ ...base, followMarket: true }, "2026-10-30", LDN).shift;
  assert.equal(clockChange({ day: "2026-10-30", minute: 10 * 60 + 15, today: t30, next: windowFor({ ...base, followMarket: true }, "2026-10-31", LDN) }), null);
  assert.equal(clockChange({ day: "2026-10-31", minute: 9 * 60, today, next }), null);
  // And next March, the day before the US moves first.
  const m = clockChange({ day: "2026-03-07", minute: 10 * 60 + 30, today: 0, next: windowFor({ ...base, followMarket: true }, "2026-03-08", LDN) })!;
  assert.match(m.title, /moves to 13:30–15:00/);
});
