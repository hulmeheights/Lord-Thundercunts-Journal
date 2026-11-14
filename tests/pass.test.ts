import { test } from "node:test";
import assert from "node:assert/strict";
import { accountDone, accountStats, cleanOverrides, dayGoal, defaults, fullRisk, passTradingDay, plan, planSor, resolve, sorValid, type Card, type Signal, type Stage, type StageCfg } from "../lib/pass/rules";

const sig = (o: Partial<Signal> = {}): Signal => ({ session: "NY", tradingDay: "2026-11-12", dir: "LONG", price: 25000, bias: "UP", vah: 24990, val: 24950, ...o });
const card = (stage: Stage = "eval", o: Partial<StageCfg> = {}, dll = false, firm: "topstep" | "lucid" = "topstep"): Card => ({ firm, stage, cfg: { ...defaults(firm, stage, dll), ...o } });
const stats = (c: Card, days: { day: string; pnl: number }[] = [], today = "2026-11-12", locked = false, base = { profit: 0, best: 0, winDays: 0 }) => accountStats(days, today, base, c.cfg, locked);
const why = (p: { take: boolean; reason: string }) => (assert.equal(p.take, false), p.reason);

test("the tested sizes by stage: eval 10 MNQ / $1,000 / $1,640, Topstep funded 7 MNQ / $700 / $1,000", () => {
  const e = defaults("topstep", "eval");
  assert.deepEqual([e.contracts, e.stopPts, fullRisk(e), e.dayGoal, e.sorOn], [10, 50, 1000, 1640, true]);
  const f = defaults("topstep", "funded");
  assert.deepEqual([f.contracts, f.stopPts, fullRisk(f), f.dayGoal, f.sorOn, f.payoutBalance, f.payoutAmount], [7, 50, 700, 1000, false, 4000, 2000]);
  assert.deepEqual([defaults("topstep", "funded", true).payoutBalance, defaults("topstep", "funded", true).dllAmount], [8000, 1000]);
  const l1 = defaults("lucid", "eval");
  assert.deepEqual([l1.contracts, l1.dayGoal, l1.consistency, l1.sorOn], [10, 1200, 0.4, false]);
  const l2 = defaults("lucid", "prelive");
  assert.deepEqual([l2.stopPts, fullRisk(l2), l2.passTarget], [62.5, 1250, 2000]);
});

test("eval, fresh: 10 MNQ, 50-point stop, 82.5-point target ($1,640 + $10 costs)", () => {
  const c = card();
  const p = plan(c, stats(c), sig());
  assert.ok(p.take);
  if (!p.take) return;
  assert.deepEqual([p.qty, p.stopPts, p.stopTicks, p.targetPts, p.targetTicks], [10, 50, 200, 82.5, 330]);
});

test("funded, fresh: 7 MNQ, $700 risk, target 72 points for the $1,000 day goal", () => {
  const c = card("funded");
  const p = plan(c, stats(c), sig());
  assert.ok(p.take);
  if (!p.take) return;
  assert.deepEqual([p.qty, p.stopPts, p.risk, p.targetPts], [7, 50, 700, 72]); // (1,000 + 7) / 14 = 71.93 → 72
});

test("the spec's example day: stopped for -$1,015, then London trades 9 MNQ with a 148-point target", () => {
  const c = card();
  const s = stats(c, [{ day: "2026-11-12", pnl: -1015 }]);
  assert.equal(dayGoal("eval", c.cfg, s), 1640);
  const p = plan(c, s, sig({ session: "LON" }));
  assert.ok(p.take);
  if (!p.take) return;
  assert.deepEqual([p.qty, p.stopPts, p.targetPts, p.goalLeft], [9, 50, 148, 2655]); // room $985 → 9 contracts; (2,655 + 9) / 18
});

test("eval day goal: $1,640, then the rest plus the $10 margin, inside the 55% rule", () => {
  const c = card();
  assert.equal(dayGoal("eval", c.cfg, stats(c)), 1640);
  assert.equal(dayGoal("eval", c.cfg, stats(c, [{ day: "2026-11-11", pnl: 1640 }])), 1370); // 3,000 - 1,640 + 10
  assert.equal(dayGoal("eval", c.cfg, stats(c, [{ day: "2026-11-11", pnl: -500 }])), 1640);
  // Best day 2,000: needs 2,000 / 0.55 = 3,636 in all → 1,636 + 10, capped at 1,640.
  assert.equal(dayGoal("eval", c.cfg, stats(c, [{ day: "2026-11-10", pnl: 2000 }])), 1640);
  // Lucid step 1: no margin, 40% rule.
  const l = card("eval", {}, false, "lucid");
  assert.equal(dayGoal("eval", l.cfg, stats(l, [{ day: "2026-11-11", pnl: 1200 }])), 1200);
});

test("two accounts, one signal: the eval aims for the $1,274 it still needs, the funded for its own $1,000", () => {
  const e = card();
  const pe = plan(e, stats(e, [{ day: "2026-11-10", pnl: 1000 }, { day: "2026-11-11", pnl: 736 }]), sig()); // 3,000 - 1,736 + 10 = 1,274 left
  const f = card("funded");
  const pf = plan(f, stats(f), sig());
  assert.ok(pe.take && pf.take);
  if (!pe.take || !pf.take) return;
  assert.equal(pe.goalLeft, 1274);
  assert.equal(pe.targetPts, 64.25); // (1,274 + 10) / 20 = 64.2 → 64.25
  assert.equal(pf.targetPts, 72);
  assert.notEqual(pe.targetTicks, pf.targetTicks);
});

test("your own stop and target: points or dollars, never past what's left of the day unless you say so", () => {
  const c = card("eval", { stopPts: 40, targetMode: "points", targetValue: 60 });
  const p = plan(c, stats(c), sig());
  assert.ok(p.take && p.stopPts === 40 && p.risk === 800 && p.targetPts === 60);
  // $500 fixed on 10 MNQ: (500 + 10) / 20 = 25.5 points.
  const d = card("eval", { targetMode: "dollars", targetValue: 500 });
  const pd = plan(d, stats(d), sig());
  assert.ok(pd.take && pd.targetPts === 25.5);
  // 200 points fixed, but only $1,640 is wanted today: cut to 82.5. With the cap off it stays 200.
  const big = card("eval", { targetMode: "points", targetValue: 200 });
  const pb = plan(big, stats(big), sig());
  assert.ok(pb.take && pb.targetPts === 82.5 && pb.capped);
  const free = card("eval", { targetMode: "points", targetValue: 200, capAtGoal: false });
  const pf = plan(free, stats(free), sig());
  assert.ok(pf.take && pf.targetPts === 200);
});

test("the day stops at the goal, at the limits you set, and when room runs out", () => {
  const c = card();
  assert.match(why(plan(c, stats(c, [{ day: "2026-11-12", pnl: 1640 }]), sig())), /goal reached/);
  assert.match(why(plan(card("eval", { lon: false }), stats(c), sig({ session: "LON" }))), /London is switched off/);
  const two = [{ day: "2026-11-12", pnl: -300 }, { day: "2026-11-12", pnl: -200 }];
  assert.match(why(plan(card("eval", { stopAfterLosses: 2 }), stats(c, two), sig())), /losing trades today/);
  assert.match(why(plan(card("eval", { maxTradesDay: 2 }), stats(c, two), sig())), /2 trades today already/);
  assert.match(why(plan(card("eval", { dayLossStop: 400 }), stats(c, two), sig())), /your stop for the day/);
  // With a daily loss limit: $600 lost, $400 left → the same 50-point stop on 4 MNQ.
  const d = card("eval", {}, true);
  const p = plan(d, stats(d, [{ day: "2026-11-12", pnl: -600 }]), sig());
  assert.ok(p.take && p.qty === 4 && p.stopPts === 50 && p.risk === 400);
  assert.match(why(plan(d, stats(d, [{ day: "2026-11-12", pnl: -1000 }]), sig())), /daily loss limit/);
  assert.match(why(plan(d, stats(d, [{ day: "2026-11-12", pnl: -910 }]), sig())), /not enough for 1 contract/);
  // Sizing down switched off: short of the full risk means no trade.
  assert.match(why(plan(card("eval", { sizeDown: false }, true), stats(d, [{ day: "2026-11-12", pnl: -600 }]), sig())), /sizing down is off/);
});

test("a few dollars short: the day cap stops the day, but the last bit to a pass still trades (and covers its costs)", () => {
  const c = card();
  assert.match(why(plan(c, stats(c, [{ day: "2026-11-12", pnl: 1630 }]), sig())), /goal reached/);
  // $2,995 made: $5 + $10 margin left → aim for the $25 minimum + $10 costs = 1.75 pt on 10 MNQ.
  const p = plan(c, stats(c, [{ day: "2026-11-10", pnl: 1630 }, { day: "2026-11-11", pnl: 1365 }]), sig());
  assert.ok(p.take && p.targetPts === 1.75);
});

test("passed needs the target AND the consistency rule; blown at the trailing limit; stuck counts as blown", () => {
  const c = card();
  assert.equal(accountDone("eval", c.cfg, stats(c, [{ day: "2026-11-10", pnl: 1640 }, { day: "2026-11-11", pnl: 1400 }]))?.kind, "passed");
  assert.equal(accountDone("eval", c.cfg, stats(c, [{ day: "2026-11-10", pnl: 1800 }, { day: "2026-11-11", pnl: 1300 }])), null); // 1,800 > 55% of 3,100
  assert.equal(accountDone("eval", c.cfg, stats(c, [{ day: "2026-11-10", pnl: 1500 }, { day: "2026-11-11", pnl: -2000 }]))?.kind, "blown"); // limit trailed to -500
  assert.equal(accountDone("eval", c.cfg, stats(c, [{ day: "2026-11-10", pnl: -1000 }, { day: "2026-11-11", pnl: -920 }]))?.kind, "blown"); // $80 of room < $100
  const l = card("eval", {}, false, "lucid");
  assert.equal(accountDone("eval", l.cfg, stats(l, [{ day: "2026-11-10", pnl: 1200 }, { day: "2026-11-11", pnl: 1200 }, { day: "2026-11-12", pnl: 700 }], "2026-11-13"))?.kind, "passed");
});

test("funded: $1,000 a day until 5 winning days, then only what's left to $4,000; payout ready; after the payout the floor is $0 and it trades on", () => {
  const c = card("funded");
  const four = [1, 2, 3, 4].map((i) => ({ day: `2026-11-0${i}`, pnl: 800 }));
  assert.equal(dayGoal("funded", c.cfg, stats(c, four, "2026-11-12")), 1000); // 4 winning days: still the full day goal
  const five = [...four, { day: "2026-11-05", pnl: 500 }]; // 3,700 after 5 winning days
  const s = stats(c, five, "2026-11-12");
  assert.equal(s.winDaysBefore, 5);
  assert.equal(dayGoal("funded", c.cfg, s), 300);
  assert.equal(accountDone("funded", c.cfg, stats(c, [...five, { day: "2026-11-12", pnl: 300 }], "2026-11-13"))?.kind, "payout");
  // Payout taken: $2,000 off, floor fixed at $0, winning days from 0 → not done, room is the whole balance.
  const after = stats(c, [], "2026-11-13", true, { profit: 2000, best: 0, winDays: 0 });
  assert.deepEqual([after.profit, after.floor, after.winDays], [2000, 0, 0]);
  assert.equal(accountDone("funded", c.cfg, after), null);
  const p = plan(c, after, sig({ tradingDay: "2026-11-13" }));
  assert.ok(p.take && p.qty === 7 && p.targetPts === 72);
  // Down to $80 with the floor at $0: less than one contract's stop → finished.
  assert.equal(accountDone("funded", c.cfg, stats(c, [{ day: "2026-11-12", pnl: -1920 }], "2026-11-13", true, { profit: 2000, best: 0, winDays: 0 }))?.kind, "blown");
});

test("no Asia trade for the weekend; the trading day rolls at 18:00 New York", () => {
  const c = card();
  assert.match(why(plan(c, stats(c, [], "2026-11-14"), sig({ tradingDay: "2026-11-14", session: "ASIA" }))), /weekend/);
  assert.equal(passTradingDay(new Date("2026-11-13T01:30:00Z")), "2026-11-13"); // Thu 20:30 NY → Friday
  assert.equal(passTradingDay(new Date("2026-11-12T15:30:00Z")), "2026-11-12");
});

test("SOR: which signals can count (3/3, London or NY AM, inside the window, not Thursday, with a target)", () => {
  const raw = { swing: "3/3", session: "LON", dow: "Mon", mins_in: 40, quiet: false, target: 25100, quiet_target: null };
  assert.deepEqual(sorValid(raw), { ok: true, session: "LON", target: 25100 });
  assert.equal(sorValid({ ...raw, swing: "3/2" }).ok, false);
  assert.equal(sorValid({ ...raw, session: "NYPM" }).ok, false);
  assert.equal(sorValid({ ...raw, session: "ASIA" }).ok, false);
  assert.equal(sorValid({ ...raw, dow: "Thu" }).ok, false);
  assert.equal(sorValid({ ...raw, mins_in: 150 }).ok, false);
  assert.equal(sorValid({ ...raw, session: "NYAM", mins_in: 89 }).ok, true);
  assert.equal(sorValid({ ...raw, session: "NYAM", mins_in: 90 }).ok, false);
  assert.equal(sorValid({ ...raw, target: null }).ok, false);
  assert.deepEqual(sorValid({ ...raw, quiet: true, quiet_target: 25015 }), { ok: true, session: "LON", target: 25015 });
  assert.equal(sorValid({ ...raw, strategy: "SNIPER" }).ok, false);
});

test("SOR: 5 MNQ at its own stop price; target capped at what's left today; fewer contracts when room is short; evals only by default", () => {
  const c = card();
  const s0 = stats(c);
  const so = { session: "LON" as const, dir: "LONG" as const, entry: 25000, stop: 24965, target: 25070 };
  const p = planSor(c, s0, so);
  assert.ok(p.take);
  if (!p.take) return;
  assert.deepEqual([p.qty, p.stop, p.stopTicks, p.targetPts, p.capped], [5, 24965, 140, 70, false]);
  // $300 left today: cap = (300 + 6.2) / 10 = 30.62 → 30.75 points.
  const s1 = stats(c, [{ day: "2026-11-12", pnl: 1340 }]);
  const p1 = planSor(c, s1, so);
  assert.ok(p1.take && p1.capped && p1.targetPts === 30.75);
  // $100 left: cap 10.75 pt is under half the 35-point stop → skip. With that rule off, it trades.
  const s2 = stats(c, [{ day: "2026-11-12", pnl: 1540 }]);
  assert.match(why(planSor(c, s2, so)), /under half/);
  assert.ok(planSor(card("eval", { sorHalfStop: false }), s2, so).take);
  // Room $200: one contract loses (35 + 0.25) x 2 + 1.24 = $71.74 → 2 contracts, same stop.
  const s3 = stats(c, [{ day: "2026-11-11", pnl: -1800 }]);
  const p3 = planSor(c, s3, so);
  assert.ok(p3.take && p3.qty === 2 && p3.stop === 24965);
  // Funded and Lucid never take SOR unless you switch it on; a session can be switched off.
  assert.match(why(planSor(card("funded"), stats(card("funded")), so)), /add-on is off/);
  assert.match(why(planSor(card("eval", { sorLon: false }), s0, so)), /switched off/);
  assert.match(why(planSor(c, stats(c, [{ day: "2026-11-12", pnl: 1640 }]), so)), /goal reached/);
  // A short: stop above, target below.
  const sh = planSor(c, s0, { session: "NYAM", dir: "SHORT", entry: 25000, stop: 25040, target: 24900 });
  assert.ok(sh.take && sh.stopTicks === 160 && sh.targetPts === 100);
});

test("a card's own settings: only real, in-range values are kept; the rest follow the tested defaults", () => {
  assert.deepEqual(cleanOverrides({ contracts: 8.4, stopPts: 40.1, dayGoal: -5, nonsense: 1, targetMode: "points", guard: "yes", payoutBalance: null }), { contracts: 8, stopPts: 40, targetMode: "points", payoutBalance: null });
  const r = resolve("topstep", "funded", false, { funded: { contracts: 5 }, eval: { contracts: 3 } });
  assert.deepEqual([r.contracts, r.dayGoal], [5, 1000]);
  assert.equal(resolve("topstep", "eval", false, { funded: { contracts: 5 } }).contracts, 10);
});
