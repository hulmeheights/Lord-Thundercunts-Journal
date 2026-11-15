import { test } from "node:test";
import assert from "node:assert/strict";
import { hbAlarm, hbState, lastDue } from "../lib/pass/heartbeat";

// November 2026, New York is UTC-5. Thu 12 Nov 10:01 NY = 15:01Z.
const at = (iso: string) => new Date(iso);

test("the last heartbeat that was due: Asia 19:51, London 03:21, New York 10:01 (New York time)", () => {
  assert.deepEqual(lastDue("C", at("2026-11-12T15:30:00Z")), { session: "NY", at: at("2026-11-12T15:01:00Z") });
  assert.deepEqual(lastDue("C", at("2026-11-12T12:00:00Z")), { session: "LON", at: at("2026-11-12T08:21:00Z") });
  assert.deepEqual(lastDue("C", at("2026-11-13T02:00:00Z")), { session: "ASIA", at: at("2026-11-13T00:51:00Z") }); // Thu evening
  assert.deepEqual(lastDue("SNIPER", at("2026-11-12T15:30:00Z")), { session: "NY", at: at("2026-11-12T14:30:00Z") });
});

test("the weekend: nothing is due from Friday's New York beat until Sunday evening's Asia beat", () => {
  const fri = { session: "NY", at: at("2026-11-13T15:01:00Z") };
  assert.deepEqual(lastDue("C", at("2026-11-14T01:00:00Z")), fri); // Friday 20:00 NY: no Asia beat on a Friday
  assert.deepEqual(lastDue("C", at("2026-11-15T20:00:00Z")), fri); // Sunday 15:00 NY
  assert.deepEqual(lastDue("C", at("2026-11-16T01:00:00Z")), { session: "ASIA", at: at("2026-11-16T00:51:00Z") }); // Sunday 20:00 NY
});

test("alive, waiting, missed, never", () => {
  const now = at("2026-11-12T15:10:00Z"); // 9 minutes after New York's beat was due
  assert.equal(hbState("C", null, now).state, "never");
  assert.equal(hbState("C", at("2026-11-12T15:01:05Z"), now).state, "alive");
  assert.equal(hbState("C", at("2026-11-12T14:59:30Z"), now).state, "alive"); // a touch early still counts
  assert.equal(hbState("C", at("2026-11-12T08:21:00Z"), now).state, "missed"); // only London's came
  assert.equal(hbState("C", at("2026-11-12T08:21:00Z"), at("2026-11-12T15:03:00Z")).state, "waiting"); // 2 minutes in: give it time
  // All weekend the Friday beat keeps it alive.
  assert.equal(hbState("C", at("2026-11-13T15:01:00Z"), at("2026-11-15T12:00:00Z")).state, "alive");
});

test("the alarm: once it's clearly missed, and not hours after the session has gone", () => {
  const london = at("2026-11-12T08:21:00Z");
  assert.equal(hbAlarm("C", london, at("2026-11-12T15:03:00Z")), null); // still within the grace
  assert.deepEqual(hbAlarm("C", london, at("2026-11-12T15:10:00Z")), { session: "NY", at: at("2026-11-12T15:01:00Z") });
  assert.equal(hbAlarm("C", london, at("2026-11-12T17:00:00Z")), null); // two hours on: too late to help
  assert.equal(hbAlarm("C", null, at("2026-11-12T15:10:00Z")), null); // never had one: the old script, no alarm
  assert.equal(hbAlarm("C", at("2026-11-12T15:01:00Z"), at("2026-11-12T15:10:00Z")), null);
});
