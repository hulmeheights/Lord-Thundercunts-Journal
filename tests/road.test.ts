import { test } from "node:test";
import assert from "node:assert/strict";
import { roadToPaid, spread } from "../lib/analytics/road";
import { feelScore, mindSummary, mindTimeline } from "../lib/analytics/mind";
import type { LedgerEntry, LedgerKind } from "../lib/analytics/ledger";
import type { JournalDay, Trade } from "../lib/types";

let seq = 0;
const e = (day: string, firm: string, kind: LedgerKind, qty = 1, amount = 0): LedgerEntry => ({
  id: `r${++seq}`, day, firm, account: null, kind, amount, qty, note: null, createdAt: `2026-01-01T00:00:${String(seq % 60).padStart(2, "0")}Z`,
});

test("road: oldest eval closes first, payouts go to the oldest unpaid funded account", () => {
  const r = roadToPaid(
    [
      e("2026-09-01", "Topstep", "evaluation", 5, 600),
      e("2026-09-05", "Topstep", "blown", 5),
      e("2026-09-06", "Topstep", "evaluation", 5, 600),
      e("2026-09-20", "Topstep", "passed", 5),
      e("2026-10-06", "Topstep", "payout", 5, 5000),
      e("2026-10-20", "Topstep", "payout", 5, 5000),
      e("2026-10-25", "Topstep", "funded_blown", 1),
    ],
    1200,
  );
  assert.equal(r.attemptsPerPass, 2);
  assert.deepEqual([r.daysToPass.median, r.daysToPass.n], [14, 5]);
  assert.deepEqual([r.daysToBlow.median, r.daysToBlow.n], [4, 5]);
  assert.deepEqual([r.daysPassToPayout.median, r.daysPassToPayout.n], [16, 5]);
  assert.equal(r.daysEvalToPayout.median, 30);
  assert.equal(r.daysBetweenPayouts.median, 14);
  assert.equal(r.fundedLifeDays.median, 35);
  assert.equal(r.fundedPaidRate, 1);
  assert.equal(r.feesPerPaidAccount, 240);
  assert.equal(r.byFirm[0]!.firm, "Topstep");
});

test("road: firms are kept apart and an empty ledger is calm", () => {
  const empty = roadToPaid([], 0);
  assert.equal(empty.attemptsPerPass, null);
  assert.equal(empty.daysToPass.median, null);
  const r = roadToPaid([e("2026-09-01", "Lucid", "evaluation"), e("2026-09-02", "Tradeify", "evaluation"), e("2026-09-12", "Tradeify", "passed")], 0);
  assert.equal(r.daysToPass.median, 10);
  assert.deepEqual(r.byFirm.map((f) => [f.firm, f.counts.attempts, f.counts.passed]), [["Tradeify", 1, 1], ["Lucid", 1, 0]]);
  assert.deepEqual(spread([1, 2, 3, 4, 5, 6, 7, 8]), { n: 8, median: 4.5, low: 2.8, high: 6.3 });
});

const day = (d: string, over: Partial<JournalDay> = {}): JournalDay => ({
  day: d, checklist: {}, tasks: [], readiness: null, intention: null, plan: null, review: null, wins: null, lessons: null, moodAfter: null,
  rulesKept: {}, lifeTags: [], lifeNote: null, isSample: false, ...over,
});
const trade = (d: string, net: number): Trade => ({
  id: `t${++seq}`, source: "manual", accountId: null, symbol: "MNQZ6", root: "MNQ", direction: "long", qty: 1, maxPosition: 1,
  entryTime: `${d}T14:30:00Z`, exitTime: `${d}T14:40:00Z`, entryPrice: 1, exitPrice: 2, grossPnl: net, fees: 0, netPnl: net, pointValue: 2,
  fillCount: 2, setups: [], tags: [], mistakes: [], emotion: null, rating: null, notes: null, plannedRisk: null, followedPlan: null, chartUrl: null,
});
const R = (n: number) => ({ sleep: n, energy: n, focus: n, mood: n });

test("mind: feelings, life tags and P&L line up by week; bumpy vs clear days", () => {
  const trades = [trade("2026-10-12", 500), trade("2026-10-13", -800), trade("2026-10-14", 300), trade("2026-10-20", -400)];
  const journals = [
    day("2026-10-12", { readiness: R(5) }),
    day("2026-10-13", { readiness: R(2), lifeTags: ["Poor sleep", "Family"], lifeNote: "Up all night with the baby" }),
    day("2026-10-14", { moodAfter: 4 }),
    day("2026-10-20", { readiness: R(1), lifeTags: ["Poor sleep"] }),
    day("2026-10-18", { lifeNote: "Weekend away" }),
  ];
  assert.equal(feelScore(journals[2]!), 4);
  const weeks = mindTimeline(trades, journals, "UTC", "week");
  assert.deepEqual(weeks.map((w) => [w.key, w.net, w.tradingDays, w.greenDays, w.redDays]), [
    ["2026-10-19", -400, 1, 0, 1],
    ["2026-10-12", 0, 3, 2, 1],
  ]);
  const w = weeks[1]!;
  assert.equal(w.label, "Week of 12 Oct");
  assert.equal(w.feel, 3.7);
  assert.deepEqual(w.tags.map((t) => t.tag), ["Family", "Poor sleep"]);
  assert.deepEqual(w.notes.map((x) => x.day), ["2026-10-18", "2026-10-13"]);
  const s = mindSummary(trades, journals, "UTC");
  const by = Object.fromEntries(s.buckets.map((b) => [b.feel, b.avgNet]));
  assert.deepEqual(by, { clear: 400, level: null, bumpy: -600 });
  assert.deepEqual(s.tags.map((t) => [t.tag, t.days, t.avgNet, t.otherAvg]), [["Poor sleep", 2, -600, 400]]);
  assert.equal(mindTimeline(trades, journals, "UTC", "year")[0]!.label, "2026");
});

test("road: results with nothing to attach to are reported, not silently dropped", () => {
  const r = roadToPaid(
    [
      e("2026-10-14", "Lucid", "evaluation", 5, 1150),
      e("2026-10-20", "Lucid", "passed", 5),
      e("2026-10-21", "Lucid", "blown", 1), // every Lucid eval was already passed
      e("2026-10-21", "Topstep", "payout", 1, 1000), // wrong firm: no passed account at Topstep
      e("2026-10-21", "Lucid", "payout", 1, 1000),
    ],
    1150,
  );
  assert.deepEqual(r.daysPassToPayout.median, 1);
  assert.deepEqual(
    r.unmatched.map((u) => [u.firm, u.kind, u.count]),
    [
      ["Lucid", "blown", 1],
      ["Topstep", "payout", 1],
    ],
  );
});

import { DEFAULT_RATES, planFor, ratesFrom } from "../lib/analytics/plan";

test("plan: $25k a month at the starting assumptions", () => {
  const p = planFor(25_000, DEFAULT_RATES, 5)!;
  assert.equal(p.payoutsPerMonth, 25);
  assert.equal(p.liveFunded, 20); // 25 payouts ÷ 1.3 a month each → 19.2, rounded up
  assert.equal(p.evalsToStart, 35); // 4 batches of 5 at 59% → 6.8 → 7 batches
  assert.equal(p.startFees, 4200);
  assert.ok(p.badStartEvals > p.evalsToStart);
  assert.equal(p.passesPerMonth, 4);
  assert.equal(p.monthlyFees, Math.round((4 / 0.59) * 120 * 100) / 100);
  assert.equal(p.daysToFirstPayout, 30);
  assert.equal(planFor(0, DEFAULT_RATES), null);
});

test("plan: your ledger beats the assumptions once there's enough; typed rates beat both", () => {
  const c = { attempts: 10, attemptSpend: 1200, passed: 6, blown: 4, payouts: 6, paidOut: 9000, fundedLost: 1, fundedMonths: 4 };
  const r = ratesFrom(c, { daysToPass: 9, daysToPayout: null }, DEFAULT_RATES, { avgPayout: 2000 });
  assert.equal(Math.round(r.rates.passRate * 1000) / 1000, 0.595); // 6 of 10, leaning on 59% until there are 30
  assert.equal(r.rates.evalPrice, 120);
  assert.equal(r.rates.avgPayout, 2000);
  assert.equal(r.source.avgPayout, "set");
  assert.equal(r.rates.payoutsPerFundedMonth, 1.5);
  assert.equal(r.rates.lossPerFundedMonth, 0.25);
  assert.equal(r.rates.daysToPass, 9);
  assert.equal(r.source.daysToPayout, "assumed");
  const thin = ratesFrom({ ...c, passed: 1, blown: 0, fundedMonths: 0.2 }, { daysToPass: null, daysToPayout: null }, DEFAULT_RATES);
  assert.equal(thin.source.passRate, "assumed");
  assert.equal(thin.source.payoutsPerFundedMonth, "assumed");
});
