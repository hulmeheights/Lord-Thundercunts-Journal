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

test("one heads-up on the Sunday evening before the first trading day at the new time", () => {
  const r0 = { ...base, followMarket: true };
  const shiftOf = (d: string) => windowFor(r0, d, LDN).shift;
  const at = (day: string, minute: number, lastTradingDay: string) => clockChange({ day, minute, before: shiftOf(lastTradingDay), next: windowFor(r0, new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10), LDN) });
  // Sunday 1 Nov, 18:15: tomorrow (Mon 2 Nov) is back to 14:30–16:00; Friday 30 Oct was 13:30–15:00.
  const r = at("2026-11-01", 18 * 60 + 15, "2026-10-30")!;
  assert.equal(r.title, "Tomorrow: back to 14:30–16:00");
  assert.match(r.body, /From Monday 2 November you trade 14:30–16:00 again/);
  // Not on Saturday 31 Oct (tomorrow is Sunday, no session), not on Monday, not outside 18:00–19:00.
  assert.equal(at("2026-10-31", 18 * 60 + 15, "2026-10-30"), null);
  assert.equal(at("2026-11-02", 18 * 60 + 15, "2026-11-02"), null);
  assert.equal(at("2026-11-01", 10 * 60, "2026-10-30"), null);
  // March: Sunday 8 Mar the window moves to 13:30–15:00; Sunday 29 Mar it moves back.
  assert.match(at("2026-03-08", 18 * 60 + 30, "2026-03-06")!.title, /Tomorrow: your window is 13:30–15:00/);
  assert.match(at("2026-03-29", 18 * 60 + 30, "2026-03-27")!.title, /Tomorrow: back to 14:30–16:00/);
});

test("copied accounts are judged one account at a time", async () => {
  const { detectTilt } = await import("../lib/analytics/tilt");
  const rules = { ...base, maxTradesPerDay: 2, stopAfterConsecutiveLosses: 2, maxDailyLoss: 500, followMarket: true };
  // One losing trade, then one winner, copied onto three accounts at 13:40 and 14:10 this week.
  const copy = (acc: string, iso: string, net: number) => ({ ...trade(iso, net), accountId: acc });
  const day = ["A", "B", "C"].flatMap((acc) => [copy(acc, "2026-10-27T13:40:00Z", -300), copy(acc, "2026-10-27T14:10:00Z", 250)]);
  assert.deepEqual(evaluateRules(day, rules, LDN).violations, []);
  assert.equal(detectTilt(day, LDN).flaggedIds.size, 0);
  // A real breach on one account is still caught: a third trade there after two losses.
  const breach = [...day, copy("A", "2026-10-27T14:20:00Z", -300), copy("A", "2026-10-27T14:30:00Z", -300), copy("A", "2026-10-27T14:40:00Z", 100)];
  const v = evaluateRules(breach, rules, LDN).violations.map((x) => x.rule).sort();
  assert.ok(v.includes("maxTrades") && v.includes("stopAfterLosses"));
});
