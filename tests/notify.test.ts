import { test } from "node:test";
import assert from "node:assert/strict";
import { capsuleReady, checkin, evening, goalNews, preSession, quiet, ruleAlerts, weekly, windowClosed } from "../lib/analytics/notify";

const fri = "2026-10-23";
const sat = "2026-10-24";
const sun = "2026-10-25";
const at = (h: number, m = 0) => h * 60 + m;

test("12:00 check-in: weekdays, noon hour only, nudges an empty plan, shows goals", () => {
  const base = { day: fri, minute: at(12, 20), sessionStart: at(14, 30), sessionEnd: at(16), plan: null, goals: [{ title: "Only 14:30–16:00 for 2 weeks", headline: "Day 6 of 14 · no breaks" }] };
  const r = checkin(base)!;
  assert.match(r.body, /window is 14:30–16:00\. No orders before 14:30/);
  assert.match(r.body, /No plan written yet/);
  assert.match(r.body, /Day 6 of 14/);
  assert.match(checkin({ ...base, plan: "VAL reclaim only" })!.body, /Plan: VAL reclaim only/);
  assert.equal(checkin({ ...base, minute: at(13, 5) }), null);
  assert.equal(checkin({ ...base, minute: at(11, 59) }), null);
  assert.equal(checkin({ ...base, day: sat }), null);
});

test("pre-session: the 90 minutes before the window, with the streak", () => {
  const base = { day: fri, minute: at(13, 40), sessionStart: at(14, 30), streak: 3, mission: "Payouts paying the bills", prep: { plan: false, readiness: true, ritualDone: 2, ritualTotal: 4 } };
  const r = preSession(base)!;
  assert.match(r.body, /50 min to go/);
  assert.match(r.body, /Before you trade: write your plan, finish the ritual \(2\/4\)/);
  assert.match(preSession({ ...base, prep: { plan: true, readiness: true, ritualDone: 4, ritualTotal: 4 } })!.body, /You're ready/);
  assert.match(r.body, /3 clean days/);
  assert.equal(preSession({ ...base, minute: at(12, 50) }), null);
  assert.equal(preSession({ ...base, minute: at(14, 31) }), null);
  assert.equal(preSession({ ...base, day: sat }), null);
});

test("evening recap reads the mission day and nudges an empty journal", () => {
  const base = { day: fri, minute: at(21), sessionEnd: at(16), streak: 4, journaled: false };
  const burn = evening({ ...base, today: { day: fri, kind: "burn", net: 412.5, trades: 2, reasons: [] } })!;
  assert.match(burn.title, /Clean day · \+\$413/);
  assert.match(burn.body, /journal/);
  const leak = evening({ ...base, journaled: true, today: { day: fri, kind: "leak", net: -2021, trades: 25, reasons: ["outside your window"] } })!;
  assert.match(leak.title, /−\$2,021/);
  assert.match(leak.body, /^Outside your window/);
  assert.equal(evening({ ...base, minute: at(18), today: undefined }), null);
  assert.equal(evening({ ...base, day: sat, today: undefined }), null);
  assert.equal(evening({ ...base, minute: at(23), today: undefined }), null); // quiet hours
});

test("weekly Observer on Sunday evening only", () => {
  const week = [{ day: "2026-10-20", kind: "burn" as const, net: 300, trades: 2, reasons: [] }, { day: fri, kind: "leak" as const, net: -2021, trades: 25, reasons: ["outside your window"] }];
  assert.match(weekly({ day: sun, minute: at(18), week })!.body, /1 clean day, 1 leak, −\$1,721/);
  assert.equal(weekly({ day: sat, minute: at(18), week }), null);
  assert.equal(weekly({ day: sun, minute: at(21), week }), null);
});

test("goals, capsules and rule alerts carry keys that dedupe them", () => {
  const news = goalNews({
    day: fri,
    minute: at(12),
    events: [{ id: "goal_a", title: "Two weeks in the window", reward: "New headphones", startedOn: "2026-10-20", status: "reached", detail: null, targetDay: null }],
    due: [{ id: "goal_b", title: "Run a marathon", targetDay: "2026-10-26", headline: null }],
  });
  assert.deepEqual(news.map((r) => r.key), ["goal_a:reached", "goal_b:due3"]);
  assert.match(news[0]!.body, /New headphones/);
  assert.equal(capsuleReady({ minute: at(12), capsules: [{ id: "cap_1", createdAt: "2026-09-23T10:00:00Z" }] })[0]!.key, "cap_1");
  const alerts = ruleAlerts({ day: fri, minute: at(13, 20), breaks: [{ rule: "session", firstEntry: "13:13", detail: "" }] });
  assert.equal(alerts[0]!.key, `${fri}:session`);
  assert.match(alerts[0]!.body, /Entry at 13:13/);
  assert.ok(quiet(at(23)) && quiet(at(6, 30)) && !quiet(at(7)));
});

test("window closed: the hour after, platform off, review nudge until it's written", () => {
  const base = { day: fri, minute: at(16, 20), sessionEnd: at(16), trades: 3, net: 640, journaled: false };
  const r = windowClosed(base)!;
  assert.equal(r.title, "Session done · +$640");
  assert.match(r.body, /Platform off/);
  assert.match(r.body, /Write the review/);
  assert.match(windowClosed({ ...base, journaled: true })!.body, /Review written/);
  assert.match(windowClosed({ ...base, trades: 0, net: 0 })!.body, /No trades today/);
  assert.equal(windowClosed({ ...base, minute: at(17, 5) }), null);
  assert.equal(windowClosed({ ...base, day: sat }), null);
});

test("positive pushes: 9:00 daily and 15:00 at weekends, rotating categories, no repeats", async () => {
  const { morning, weekendLift, uplift, upliftIndex, PRAYERS, THANKFUL, MANIFEST } = await import("../lib/analytics/notify");
  const { QUOTES } = await import("../lib/content/quotes");
  assert.ok(QUOTES.length > 365, `only ${QUOTES.length} quotes`);
  for (const list of [PRAYERS, THANKFUL, MANIFEST]) {
    assert.ok(list.length >= 100);
    assert.equal(new Set(list.map((x) => x.body)).size, list.length, "duplicate wording");
  }
  assert.equal(new Set(QUOTES.map((x) => x.text.toLowerCase())).size, QUOTES.length);
  assert.ok(PRAYERS.some((p) => /God/.test(p.body)) && PRAYERS.some((p) => /universe/.test(p.body)));

  assert.equal(morning({ day: fri, minute: at(8, 59), quotes: QUOTES }), null);
  assert.equal(morning({ day: fri, minute: at(10), quotes: QUOTES }), null);
  assert.deepEqual(morning({ day: fri, minute: at(9, 10), quotes: QUOTES }), morning({ day: fri, minute: at(9, 50), quotes: QUOTES }));
  assert.equal(weekendLift({ day: fri, minute: at(15, 10), quotes: QUOTES }), null);
  assert.equal(weekendLift({ day: sat, minute: at(14, 50), quotes: QUOTES }), null);
  assert.equal(weekendLift({ day: sat, minute: at(15, 10), quotes: QUOTES })!.kind, "uplift");

  // A year of pushes (every morning plus weekend afternoons): every index distinct, no line twice.
  const seen = new Set<string>();
  const idx = new Set<number>();
  let last = "";
  for (let d = 0; d < 365; d++) {
    const day = new Date(Date.UTC(2026, 9, 24 + d)).toISOString().slice(0, 10);
    const slots: ("morning" | "weekend")[] = ["morning", new Date(`${day}T00:00:00Z`).getUTCDay() % 6 === 0 ? "weekend" : null].filter(Boolean) as never;
    for (const slot of slots) {
      const n = upliftIndex(day, slot);
      assert.ok(!idx.has(n), `index ${n} reused on ${day}`);
      idx.add(n);
      const u = uplift({ day, quotes: QUOTES, slot });
      assert.ok(!seen.has(u.body), `repeated on ${day}: ${u.body}`);
      assert.notEqual(u.title === "Thought for the day" ? "q" : u.title, last, `same kind twice in a row on ${day}`);
      last = u.title === "Thought for the day" ? "q" : u.title;
      seen.add(u.body);
    }
  }
});
