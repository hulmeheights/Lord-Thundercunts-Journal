import { test } from "node:test";
import assert from "node:assert/strict";
import { Alert, bracketOk, bracketTicks, gate, pnlOf, sessionOf, tradingDayStart } from "../lib/bot/signal";

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
  const a = { id: "a", label: "A", topstepAccountId: "1", contracts: 5, maxDailyLoss: 500, maxDailyWin: 1600, enabled: true };
  assert.equal(gate(a, 0), null);
  assert.match(gate(a, 1600)!, /max daily win/);
  assert.match(gate(a, -500)!, /daily loss limit/);
  assert.equal(gate({ ...a, maxDailyWin: null }, 5000), null);
});
