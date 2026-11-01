import { test } from "node:test";
import assert from "node:assert/strict";
import { Alert, bracketOk, bracketTicks, gate, hedgeCheck, pnlOf, sessionOf, targetReached, tradingDayStart } from "../lib/bot/signal";

test("the alert message parses exactly as the script sends it", () => {
  const entry = Alert.parse({ price: 21000.25, data: { secret: "s", event: "entry", dir: "LONG", qty: 5, stop: 20980, target: 21040.5 } });
  assert.equal(entry.data.event, "entry");
  assert.ok(Alert.safeParse({ price: 21000, data: { secret: "s", event: "exit", dir: "SHORT" } }).success);
  assert.ok(Alert.safeParse({ price: 21000, data: { secret: "s", event: "flatten" } }).success);
  assert.ok(!Alert.safeParse({ price: 21000, data: { secret: "s", event: "entry", dir: "LONG" } }).success); // no stop/target
  assert.ok(!Alert.safeParse({ price: 21000, data: { secret: "s", event: "buy" } }).success);
});

test("sessions by New York time, across the clock change", () => {
  assert.equal(sessionOf("2026-10-30T13:45:00Z"), "NYAM"); // 09:45 NY (EDT)
  assert.equal(sessionOf("2026-11-02T14:45:00Z"), "NYAM"); // 09:45 NY (EST)
  assert.equal(sessionOf("2026-10-30T17:45:00Z"), "NYPM"); // 13:45
  assert.equal(sessionOf("2026-10-30T07:30:00Z"), "LON"); // 03:30
  assert.equal(sessionOf("2026-10-31T00:30:00Z"), "ASIA"); // 20:30 Fri
  assert.equal(sessionOf("2026-10-30T16:30:00Z"), "OTHER"); // 12:30
});

test("the trading day starts at 18:00 New York", () => {
  assert.equal(tradingDayStart(new Date("2026-10-30T14:00:00Z")).toISOString(), "2026-10-29T22:00:00.000Z"); // 10:00 Fri → 18:00 Thu
  assert.equal(tradingDayStart(new Date("2026-10-30T22:30:00Z")).toISOString(), "2026-10-30T22:00:00.000Z"); // 18:30 Fri → 18:00 Fri
});

test("bracket ticks, sanity check and P&L for MNQ", () => {
  assert.deepEqual(bracketTicks(21000, 20980, 21040.5), { stopTicks: 80, targetTicks: 162 });
  assert.equal(bracketOk("LONG", 21000, 20980, 21040), null);
  assert.ok(bracketOk("LONG", 21000, 21010, 21040)); // stop above a long
  assert.ok(bracketOk("SHORT", 21000, 20990, 20950)); // stop below a short
  assert.equal(pnlOf("LONG", 21000, 21040.5, 5), 405);
  assert.equal(pnlOf("SHORT", 21000, 21020, 5), -200);
});

test("each account's own daily gates", () => {
  const a = { id: "a", label: "A", topstepAccountId: "1", contracts: 5, maxDailyLoss: 500, maxDailyWin: 1600, enabled: true, profitTarget: 3000, startBalance: 50000 };
  assert.equal(gate(a, 0), null);
  assert.match(gate(a, 1600)!, /max daily win/);
  assert.match(gate(a, -500)!, /daily loss limit/);
  assert.equal(gate({ ...a, maxDailyWin: null }, 5000), null);
});

test("account profit target: passed once the balance is that far above the start; blank = never", () => {
  const card = { profitTarget: 3000 };
  assert.equal(targetReached(card, 53_234 - 50_000), true); // the trade closed at $3,234: passed
  assert.equal(targetReached(card, 2_999), false);
  assert.equal(targetReached({ profitTarget: null }, 1_000_000), false);
});

test("hedge guard: never long on one account and short on another", () => {
  const flat = new Map([[1, []], [2, []], [3, []]]);
  assert.deepEqual(hedgeCheck("SHORT", flat), { opposite: [], busy: new Set() }); // normal: everything trades
  const stuckLong = new Map([[1, [{ type: 1, size: 5 }]], [2, []], [3, []]]);
  assert.deepEqual(hedgeCheck("SHORT", stuckLong).opposite, [1]); // a short now would hedge: skipped everywhere
  assert.deepEqual(hedgeCheck("LONG", stuckLong), { opposite: [], busy: new Set([1]) }); // same side: only account 1 sits out
});
