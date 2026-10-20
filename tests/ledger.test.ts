import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByMonth, monthRange, signedAmount, sortEntries, summarizeLedger, type LedgerEntry, type LedgerKind } from "../lib/analytics/ledger";

let seq = 0;
function e(day: string, firm: string, kind: LedgerKind, amount: number, extra: Partial<LedgerEntry> = {}): LedgerEntry {
  seq++;
  return { id: `l${seq}`, day, firm, account: null, kind, amount, qty: 1, note: null, createdAt: `2026-01-01T00:00:${String(seq % 60).padStart(2, "0")}Z`, ...extra };
}

test("empty ledger is calm, not broken", () => {
  const s = summarizeLedger([]);
  assert.equal(s.count, 0);
  assert.equal(s.spent, 0);
  assert.equal(s.cost, 0);
  assert.equal(s.received, 0);
  assert.equal(s.net, 0);
  assert.equal(s.roi, null);
  assert.equal(s.costPerPayout, null);
  assert.equal(s.toBreakEven, 0);
  assert.deepEqual(s.byFirm, []);
  assert.deepEqual(s.byMonth, []);
  assert.equal(s.firstDay, null);
});

test("payouts and refunds come in, everything else goes out", () => {
  assert.equal(signedAmount({ kind: "payout", amount: 500 }), 500);
  assert.equal(signedAmount({ kind: "refund", amount: 49 }), 49);
  assert.equal(signedAmount({ kind: "evaluation", amount: 165 }), -165);
  assert.equal(signedAmount({ kind: "subscription", amount: 39 }), -39);
  assert.equal(signedAmount({ kind: "other", amount: 10 }), -10);
});

test("totals, net, refund-aware cost, ROI, evals bought, payouts and cost per payout", () => {
  const s = summarizeLedger([
    e("2026-03-02", "Topstep", "evaluation", 165),
    e("2026-03-20", "Topstep", "reset", 99),
    e("2026-04-04", "Topstep", "activation", 149),
    e("2026-05-10", "Topstep", "payout", 1200),
    e("2026-05-12", "Lucid", "evaluation", 140.5),
    e("2026-05-30", "Lucid", "refund", 40.5),
    e("2026-06-01", "Topstep", "payout", 900),
    e("2026-06-02", "Tradeify", "subscription", 29.99),
  ]);
  assert.equal(s.count, 8);
  assert.equal(s.spent, 583.49); // 165 + 99 + 149 + 140.5 + 29.99
  assert.equal(s.received, 2140.5); // 1200 + 900 + 40.5
  assert.equal(s.paidOut, 2100);
  assert.equal(s.refunds, 40.5);
  assert.equal(s.net, 1557.01);
  // Refunds reduce what the evals cost, so paid out − cost reconciles with net.
  assert.equal(s.cost, 542.99);
  assert.equal(Math.round((s.paidOut - s.cost) * 100) / 100, s.net);
  assert.ok(s.roi !== null && Math.abs(s.roi - 1557.01 / 542.99) < 1e-9);
  assert.equal(s.evals, 2);
  assert.equal(s.resets, 1);
  assert.equal(s.activations, 1);
  assert.equal(s.payouts, 2);
  assert.equal(s.costPerPayout, 271.5); // 542.99 / 2, rounded to cents
  assert.equal(s.toBreakEven, 0);
  assert.equal(s.firstDay, "2026-03-02");
  assert.equal(s.lastDay, "2026-06-02");
  assert.equal(s.byKind.evaluation.count, 2);
  assert.equal(s.byKind.evaluation.total, 305.5);
});

test("a losing ledger knows what squares it", () => {
  const s = summarizeLedger([e("2026-07-01", "Apex", "evaluation", 167), e("2026-07-09", "Apex", "reset", 80)]);
  assert.equal(s.net, -247);
  assert.equal(s.toBreakEven, 247);
  assert.ok(s.roi !== null && s.roi === -1);
  assert.equal(s.costPerPayout, null);
});

test("firms group case- and space-insensitively and sort by money moved", () => {
  const s = summarizeLedger([
    e("2026-03-01", "Topstep", "evaluation", 100),
    e("2026-03-02", " topstep ", "payout", 1000),
    e("2026-03-03", "Take  Profit Trader", "evaluation", 150),
    e("2026-03-04", "take profit trader", "reset", 100),
    e("2026-03-05", "Lucid", "evaluation", 80),
  ]);
  assert.deepEqual(
    s.byFirm.map((f) => [f.firm, f.spent, f.received, f.net, f.evals, f.payouts, f.entries]),
    [
      ["Topstep", 100, 1000, 900, 1, 1, 2],
      ["Take Profit Trader", 250, 0, -250, 1, 0, 2],
      ["Lucid", 80, 0, -80, 1, 0, 1],
    ],
  );
});

test("a firm's refunds lower its cost, not its payouts", () => {
  const s = summarizeLedger([
    e("2026-05-01", "Tradeify", "evaluation", 109),
    e("2026-05-09", "Tradeify", "reset", 89),
    e("2026-05-20", "Tradeify", "refund", 30),
  ]);
  const f = s.byFirm[0]!;
  assert.deepEqual([f.spent, f.cost, f.refunds, f.paidOut, f.received, f.net, f.payouts], [198, 168, 30, 0, 30, -168, 0]);
  assert.equal(s.cost, 168);
  assert.equal(s.costPerPayout, null);
  assert.equal(s.toBreakEven, 168);
});

test("refunds that exceed spend never produce a negative cost per payout or a fake ROI", () => {
  const s = summarizeLedger([e("2026-05-01", "Apex", "refund", 50), e("2026-05-02", "Apex", "payout", 400)]);
  assert.equal(s.cost, -50);
  assert.equal(s.roi, null);
  assert.equal(s.costPerPayout, 0);
  assert.equal(s.net, 450);
});

test("months are continuous with a running cumulative net", () => {
  const s = summarizeLedger([
    e("2026-01-15", "Topstep", "evaluation", 165),
    e("2026-03-03", "Topstep", "payout", 500),
    e("2026-03-28", "Lucid", "evaluation", 100),
  ]);
  assert.deepEqual(
    s.byMonth.map((m) => [m.month, m.spent, m.received, m.net, m.cumNet]),
    [
      ["2026-01", 165, 0, -165, -165],
      ["2026-02", 0, 0, 0, -165],
      ["2026-03", 100, 500, 400, 235],
    ],
  );
  assert.equal(s.byMonth.at(-1)!.cumNet, s.net);
});

test("month ranges cross the year and refuse to run backwards", () => {
  assert.deepEqual(monthRange("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(monthRange("2026-05", "2026-05"), ["2026-05"]);
  assert.deepEqual(monthRange("2026-05", "2026-04"), []);
});

test("bad amounts never poison the totals", () => {
  const s = summarizeLedger([e("2026-02-01", "Topstep", "evaluation", Number.NaN), e("2026-02-02", "Topstep", "evaluation", -50), e("2026-02-03", "Topstep", "evaluation", 49)]);
  assert.equal(s.spent, 49);
  assert.equal(s.net, -49);
});

test("entries sort newest first and group into months with a net each", () => {
  const a = e("2026-04-01", "Topstep", "evaluation", 165, { createdAt: "2026-04-01T10:00:00Z" });
  const b = e("2026-04-01", "Topstep", "reset", 99, { createdAt: "2026-04-01T12:00:00Z" });
  const c = e("2026-05-03", "Topstep", "payout", 700);
  assert.deepEqual(sortEntries([a, b, c]).map((x) => x.id), [c.id, b.id, a.id]);
  const g = groupByMonth([a, b, c]);
  assert.deepEqual(
    g.map((m) => [m.month, m.net, m.entries.length]),
    [
      ["2026-05", 700, 1],
      ["2026-04", -264, 2],
    ],
  );
});

test("scoreboard: copied evals, passes, blows and payouts count by qty; results carry no money", () => {
  const s = summarizeLedger([
    e("2026-09-01", "Topstep", "evaluation", 600, { qty: 5 }),
    e("2026-09-01", "Lucid", "evaluation", 1150, { qty: 5 }),
    e("2026-09-12", "Topstep", "passed", 0, { qty: 5 }),
    e("2026-09-12", "Lucid", "blown", 999, { qty: 5 }), // a stray amount on a result is ignored
    e("2026-09-30", "Topstep", "funded_blown", 0, { qty: 1 }),
    e("2026-10-02", "Topstep", "payout", 4000, { qty: 4 }),
  ]);
  assert.equal(s.evals, 10);
  assert.equal(s.passed, 5);
  assert.equal(s.blown, 5);
  assert.equal(s.passRate, 0.5);
  assert.equal(s.inEval, 0);
  assert.equal(s.fundedBlown, 1);
  assert.equal(s.liveFunded, 4);
  assert.equal(s.payouts, 4);
  assert.equal(s.avgPayout, 1000);
  assert.equal(s.cost, 1750);
  assert.equal(s.net, 2250);
  assert.equal(s.costPerFunded, 350);
  assert.equal(s.paidPerFunded, 800);
  const top = s.byFirm.find((f) => f.firm === "Topstep")!;
  assert.deepEqual([top.evals, top.passed, top.blown, top.passRate, top.fundedBlown, top.payouts], [5, 5, 0, 1, 1, 4]);
  assert.equal(signedAmount({ kind: "blown", amount: 999 }), 0);
});

test("scoreboard: evals not yet marked are still running; bad qty counts as one", () => {
  const s = summarizeLedger([e("2026-09-01", "Tradeify", "evaluation", 360, { qty: 3 }), e("2026-09-02", "Tradeify", "reset", 80, { qty: Number.NaN }), e("2026-09-05", "Tradeify", "passed", 0)]);
  assert.equal(s.evals, 3);
  assert.equal(s.resets, 1);
  assert.equal(s.inEval, 3);
  assert.equal(s.passRate, 1);
  assert.equal(s.costPerPayout, null);
});
