import { test } from "node:test";
import assert from "node:assert/strict";
import { HEALTH_PRELOAD, health, healthBack, healthWarning, onePerSignal, weeklyDue, type HealthRow } from "../lib/bot/health";

test("PF60 starts at about 1.27 from the 60 preloaded backtest trades", () => {
  assert.equal(HEALTH_PRELOAD.length, 60);
  const h = health([]);
  assert.equal(h.n, 60);
  assert.equal(h.real, 0);
  assert.equal(h.pf60!.toFixed(2), "1.27");
  assert.ok(h.ok);
});

test("each real trade pushes the oldest out; fake losers on practice drop it below 1.0, winners bring it back", () => {
  const losers: number[] = [];
  let h = health(losers);
  while (h.ok) {
    losers.push(-400);
    h = health(losers);
  }
  assert.ok(h.pf60! < 1);
  assert.equal(h.n, 60);
  assert.equal(h.real, losers.length);
  assert.equal(losers.length, 15); // 15 straight $400 losers (the oldest pushed out are mostly losers too)
  assert.match(healthWarning(h.pf60), /^⚠️ S1 health: PF60 = 0\.\d\d \(below 1\.0\)\. Strategy may have stopped working\./);
  const back = [...losers];
  while (!h.ok) {
    back.push(1591);
    h = health(back);
  }
  assert.match(healthBack(h.pf60), /^✅ S1 health back: PF60 = \d\.\d\d$/);
});

test("one trade per signal: live beats dry, scaled to 5 MNQ, test signals ignored", () => {
  const r = (o: Partial<HealthRow>): HealthRow => ({ id: "x", tvId: null, signalId: null, mode: "dry", qty: 5, pnl: 0, exitedAt: "2026-11-05T15:00:00Z", ...o });
  const out = onePerSignal([
    r({ id: "a", tvId: "S1", mode: "dry", qty: 5, pnl: 100 }),
    r({ id: "b", tvId: "S1", mode: "live", qty: 4, pnl: 80 }),
    r({ id: "c", tvId: "S1", mode: "live", qty: 4, pnl: 80 }),
    r({ id: "d", tvId: "S2", qty: 2, pnl: -100, exitedAt: "2026-11-05T14:00:00Z" }),
    r({ id: "e", tvId: "123-3/3-TEST", pnl: -999 }),
  ]);
  assert.deepEqual(out.map((t) => [t.key, t.pnl]), [["S2", -250], ["S1", 100]]);
});

test("the weekly message is due on Sundays from 18:00 UK, once", () => {
  const sun1800 = new Date("2026-11-08T18:00:30Z"); // GMT in November
  assert.ok(weeklyDue(sun1800, null));
  assert.ok(!weeklyDue(new Date("2026-11-08T17:59:00Z"), null));
  assert.ok(!weeklyDue(new Date("2026-11-09T18:00:00Z"), null));
  assert.ok(!weeklyDue(new Date("2026-11-08T19:00:00Z"), sun1800));
  assert.ok(weeklyDue(new Date("2026-11-15T18:00:30Z"), sun1800));
  assert.ok(weeklyDue(new Date("2026-06-07T17:00:30Z"), null)); // 18:00 BST
});
