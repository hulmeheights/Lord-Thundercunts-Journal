import { test } from "node:test";
import assert from "node:assert/strict";
import { evening, preSession } from "../lib/analytics/notify";

const fri = "2026-10-23";
const sat = "2026-10-24";

test("pre-session nudge goes only on weekdays before the window opens", () => {
  const base = { day: fri, minute: 13 * 60 + 40, sessionStart: 14 * 60 + 30, plan: "VAL reclaim only", streak: 3, mission: "Payouts paying the bills" };
  const r = preSession(base)!;
  assert.equal(r.kind, "pre");
  assert.match(r.body, /opens at 14:30/);
  assert.match(r.body, /Plan: VAL reclaim only/);
  assert.match(r.body, /3 clean days/);
  assert.equal(preSession({ ...base, minute: 14 * 60 + 31 }), null);
  assert.equal(preSession({ ...base, day: sat }), null);
});

test("evening recap reads the mission day and nudges an empty journal", () => {
  const base = { day: fri, minute: 22 * 60, sessionEnd: 16 * 60, streak: 4, journaled: false };
  const burn = evening({ ...base, today: { day: fri, kind: "burn", net: 412.5, trades: 2, reasons: [] } })!;
  assert.match(burn.title, /Clean day · \+\$413/);
  assert.match(burn.body, /journal/);
  const leak = evening({ ...base, journaled: true, today: { day: fri, kind: "leak", net: -2021, trades: 25, reasons: ["outside your window"] } })!;
  assert.match(leak.title, /−\$2,021/);
  assert.match(leak.body, /^Outside your window/);
  assert.doesNotMatch(leak.body, /journal/);
  assert.equal(evening({ ...base, minute: 15 * 60, today: undefined }), null);
  assert.equal(evening({ ...base, day: sat, today: undefined }), null);
});
