import { test } from "node:test";
import assert from "node:assert/strict";
import { capsuleStatus, evaluateCapsule } from "../lib/analytics/capsule";
import type { LedgerEntry } from "../lib/analytics/ledger";
import type { Capsule, Trade } from "../lib/types";

let seq = 0;
const trade = (d: string, net: number, hh = "14:30"): Trade => ({
  id: `c${++seq}`, source: "manual", accountId: null, symbol: "MNQZ6", root: "MNQ", direction: "long", qty: 1, maxPosition: 1,
  entryTime: `${d}T${hh}:00Z`, exitTime: `${d}T${hh}:00Z`, entryPrice: 1, exitPrice: 2, grossPnl: net, fees: 0, netPnl: net, pointValue: 2,
  fillCount: 2, setups: [], tags: [], mistakes: [], emotion: null, rating: null, grade: null, notes: null, plannedRisk: null, followedPlan: null, chartUrl: null,
});
const led = (day: string, kind: LedgerEntry["kind"], qty = 1, amount = 0): LedgerEntry => ({ id: `l${++seq}`, day, firm: "Lucid", account: null, kind, amount, qty, note: null, createdAt: null });
const cap = (goals: Capsule["goals"], deliverOn = "2026-10-31"): Capsule => ({ id: "cap1", message: "Keep going", createdAt: "2026-10-01T09:00:00Z", deliverOn, openedAt: null, goals });

const trades = [trade("2026-09-28", 900), trade("2026-10-02", 600), trade("2026-10-03", -200), trade("2026-10-06", 700), trade("2026-10-06", 100, "15:00")];
const ledger = [led("2026-09-20", "passed", 5), led("2026-10-10", "passed", 5), led("2026-10-20", "payout", 2, 2000)];

test("capsule goals: totals count from the seal date and are met early; rates wait for opening day", () => {
  const goals: Capsule["goals"] = [
    { id: "a", kind: "net", target: 1000 },
    { id: "b", kind: "evalsPassed", target: 5 },
    { id: "c", kind: "winRate", target: 70 },
    { id: "d", kind: "maxTradesPerDay", target: 1 },
    { id: "e", kind: "custom", target: null, text: "Journal daily" },
  ];
  const mid = evaluateCapsule(cap(goals), trades, ledger, "UTC", "2026-10-15");
  assert.deepEqual(mid.map((r) => [r.goal.id, r.met]), [["a", true], ["b", true], ["c", null], ["d", false], ["e", null]]);
  assert.equal(mid[0]!.actual, "+$1,200 so far"); // the 28 Sep trade is before the seal date
  assert.equal(mid[2]!.actual, "75% of 4 trades");
  const end = evaluateCapsule(cap(goals, "2026-10-14"), trades, ledger, "UTC", "2026-10-20");
  assert.equal(end[2]!.met, true);
  const ticked = evaluateCapsule(cap([{ id: "e", kind: "custom", target: null, text: "Journal daily", done: true }]), trades, ledger, "UTC", "2026-11-05");
  assert.equal(ticked[0]!.met, true);
});

test("capsule goals: payouts and paid out; a missed total is crossed off on opening day", () => {
  const r = evaluateCapsule(cap([{ id: "p", kind: "payouts", target: 3 }, { id: "q", kind: "paidOut", target: 2000 }], "2026-10-25"), trades, ledger, "UTC", "2026-10-26");
  assert.deepEqual(r.map((x) => [x.met, x.actual]), [[false, "2 payouts"], [true, "$2,000"]]);
  assert.equal(capsuleStatus({ deliverOn: "2026-10-25", openedAt: null }, "2026-10-24"), "sealed");
  assert.equal(capsuleStatus({ deliverOn: "2026-10-25", openedAt: null }, "2026-10-25"), "ready");
  assert.equal(capsuleStatus({ deliverOn: "2026-10-25", openedAt: "2026-10-25T10:00:00Z" }, "2026-10-26"), "opened");
});
