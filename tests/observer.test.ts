import { test } from "node:test";
import assert from "node:assert/strict";
import type { JournalDay, PropSettings, RitualItem, Trade, TradingRules } from "../lib/types";
import { evaluateRules } from "../lib/analytics/rules";
import { detectTilt } from "../lib/analytics/tilt";
import { buildDossier, checkOrder, observerName, orderText, perceptionGap, type OrderContext } from "../lib/analytics/observer";

const TZ = "America/New_York";
let seq = 0;
function trade(day: string, hhmm: string, net: number, extra: Partial<Trade> & { holdMin?: number } = {}): Trade {
  seq++;
  const [h, m] = hhmm.split(":").map(Number);
  const entry = new Date(`${day}T${String(h! + 4).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  const exit = new Date(entry.getTime() + (extra.holdMin ?? 3) * 60_000);
  const { holdMin: _h, ...rest } = extra;
  return {
    id: `o${seq}`, source: "sample", accountId: "acc", symbol: "MNQZ6", root: "MNQ", direction: "long",
    qty: 1, maxPosition: 1, entryTime: entry.toISOString(), exitTime: exit.toISOString(), entryPrice: 1, exitPrice: 1,
    grossPnl: net, fees: 0, netPnl: net, pointValue: 2, fillCount: 2, setups: [], tags: [], mistakes: [],
    emotion: null, rating: null, notes: null, plannedRisk: null, followedPlan: null, chartUrl: null, ...rest,
  };
}

const RULES: TradingRules = {
  maxTradesPerDay: 2, maxDailyLoss: 500, stopAfterConsecutiveLosses: 3, maxContracts: null, maxLossPerTrade: null,
  cooldownMinutesAfterLoss: null, sessionStart: null, sessionEnd: null, defaultRisk: null, custom: [],
};
const PROP: PropSettings = {
  enabled: true, firm: "Topstep", preset: "50K", phase: "combine", startBalance: 50_000, profitTarget: 3_000,
  maxLossLimit: 2_000, dailyLossLimit: 1_000, consistencyPct: 50, maxContracts: 5, startDate: "2026-01-01", accountIds: [],
};
const RITUAL: RitualItem[] = [{ id: "plan", label: "Wrote my plan", group: "pre" }];

function dossierFor(trades: Trade[], journals: JournalDay[] = [], rules = RULES) {
  return buildDossier({
    name: "Lord",
    trades,
    journals,
    rules: evaluateRules(trades, rules, TZ),
    tilt: detectTilt(trades, TZ),
    settings: { rules, prop: PROP, ritual: RITUAL },
    tz: TZ,
    from: "2026-09-01",
    to: "2026-10-15",
    statedWant: "Lord wants to pass the combine this month.",
  });
}

test("observer name uses the first word unless overridden", () => {
  assert.equal(observerName("Lord Thundercunt"), "Lord");
  assert.equal(observerName("  "), "The trader");
  assert.equal(observerName("Lord Thundercunt", "LT"), "LT");
});

test("dossier finds overtrading as the costliest obstacle and writes third-person facts", () => {
  const trades: Trade[] = [];
  // 10 days: first two trades win, the next three lose.
  for (let d = 1; d <= 10; d++) {
    const day = `2026-09-${String(d).padStart(2, "0")}`;
    trades.push(trade(day, "09:35", 120), trade(day, "09:50", 80));
    trades.push(trade(day, "10:30", -90), trade(day, "10:50", -90), trade(day, "11:10", -90));
  }
  const d = dossierFor(trades);
  assert.equal(d.stopping[0]?.key, "overtrading");
  assert.equal(Math.round(d.stopping[0]!.cost), 2700);
  assert.ok(d.stopping[0]!.title.startsWith("Lord "));
  assert.ok(d.doing[0]!.text.startsWith("Lord took 50 trades over 10 trading days"));
  assert.equal(d.wants[0]?.source, "stated");
  assert.ok(d.wants.some((w) => w.source === "prop"));
  assert.ok(d.tell.length >= 1 && d.tell[0]!.rulesPatch?.maxTradesPerDay === 2);
  // Obstacles are ranked by cost.
  for (let i = 1; i < d.stopping.length; i++) assert.ok(d.stopping[i - 1]!.cost >= d.stopping[i]!.cost);
  // No gendered pronouns in generated copy.
  const copy = JSON.stringify(d);
  assert.ok(!/\b(he|his|him|she|her)\b/i.test(copy), "copy must not assume pronouns");
});

test("dossier detects holding losers and sizing up after losses", () => {
  const trades: Trade[] = [];
  for (let d = 1; d <= 8; d++) {
    const day = `2026-09-${String(d).padStart(2, "0")}`;
    trades.push(trade(day, "09:35", 60, { holdMin: 2 }));
    trades.push(trade(day, "09:45", d % 2 ? -40 : -160, { holdMin: d % 2 ? 2 : 25 }));
    trades.push(trade(day, "10:20", -70, { qty: 3 }));
  }
  const d = dossierFor(trades, [], { ...RULES, maxTradesPerDay: 5 });
  const keys = d.stopping.map((o) => o.key);
  assert.ok(keys.includes("holding-losers"), `expected holding-losers in ${keys.join(",")}`);
  assert.ok(keys.includes("sizing-up"), `expected sizing-up in ${keys.join(",")}`);
});

test("prepared days vs unprepared days", () => {
  const trades: Trade[] = [];
  const journals: JournalDay[] = [];
  for (let d = 1; d <= 8; d++) {
    const day = `2026-09-${String(d).padStart(2, "0")}`;
    const prep = d <= 4;
    trades.push(trade(day, "09:40", prep ? 150 : -120));
    journals.push({
      day, checklist: { plan: prep }, tasks: [], readiness: null, intention: null, plan: null, review: null, wins: null,
      lessons: null, moodAfter: null, rulesKept: {}, isSample: false,
    });
  }
  const d = dossierFor(trades, journals, { ...RULES, maxTradesPerDay: 5 });
  const prep = d.stopping.find((o) => o.key === "unprepared");
  assert.ok(prep, "unprepared obstacle expected");
  assert.equal(Math.round(prep!.cost), 1080); // (150 − −120) × 4 unprepared days
});

test("perception gap: aligned, partial and blind", () => {
  const trades: Trade[] = [];
  for (let d = 1; d <= 10; d++) {
    const day = `2026-09-${String(d).padStart(2, "0")}`;
    trades.push(trade(day, "09:35", 120), trade(day, "09:50", 80), trade(day, "10:30", -90), trade(day, "10:50", -90), trade(day, "11:10", -90));
  }
  const d = dossierFor(trades);
  assert.equal(perceptionGap(["overtrading"], d).verdict, "aligned");
  const second = d.stopping[1]?.key;
  if (second) assert.equal(perceptionGap([second], d).verdict, "partial");
  assert.equal(perceptionGap(["fees"], d).verdict, "blind");
  assert.equal(perceptionGap([], d).verdict, "unknown");
});

test("empty window yields a waiting headline and no obstacles", () => {
  const d = dossierFor([]);
  assert.equal(d.stopping.length, 0);
  assert.match(d.headline, /hasn't traded/);
});

// ── Orders ─────────────────────────────────────────────────────────────────

const DAY = "2026-10-14";
function ctx(trades: Trade[], extra: Partial<OrderContext> = {}): OrderContext {
  return { trades, journal: null, rules: { ...RULES, maxTradesPerDay: 5 }, ritual: RITUAL, tz: TZ, ...extra };
}

test("dossier carries a marked-up headline and titled facts", () => {
  const trades: Trade[] = [];
  for (let d = 1; d <= 10; d++) {
    const day = `2026-09-${String(d).padStart(2, "0")}`;
    trades.push(trade(day, "09:35", 120), trade(day, "09:50", 80), trade(day, "10:30", -90), trade(day, "10:50", -90), trade(day, "11:10", -90));
  }
  const d = dossierFor(trades);
  assert.match(d.headlineMd, /\*[^*]+\*/, "the obstacle phrase is wrapped in asterisks");
  assert.ok(!d.headline.includes("*"), "the plain headline has no markup");
  for (const f of [...d.doing, ...d.strengths]) assert.ok(f.title.length > 0 && f.title.length <= 40, `short title: ${f.title}`);
  // Instructions carry the numbers they were written with.
  assert.deepEqual(d.stopping.find((o) => o.key === "overtrading")!.instruction.params, { limit: 2 });
});

test("order text is generated from params and is pronoun-free", () => {
  const t = orderText("revenge", { minutes: 12 }, "Lord");
  assert.equal(t.when, "Lord takes a loss");
  assert.match(t.then, /waits 12 minutes/);
  assert.equal(orderText("overtrading", { limit: 1 }, "Lord").when, "Lord has taken 1 trade");
  assert.equal(orderText("bad-hours", { hour: 9 }, "Lord").when, "the clock reaches 09:00");
  // Missing params fall back to sane defaults rather than "undefined".
  assert.ok(!JSON.stringify(orderText("mistakes", {}, "Lord")).includes("undefined"));
});

test("checkOrder: overtrading counts the day's entries against the limit", () => {
  const three = [trade(DAY, "09:35", 50), trade(DAY, "09:50", -20), trade(DAY, "10:10", 30)];
  assert.equal(checkOrder("overtrading", { limit: 3 }, DAY, ctx(three)).verdict, "kept");
  const four = [...three, trade(DAY, "10:40", -40)];
  const broken = checkOrder("overtrading", { limit: 3 }, DAY, ctx(four));
  assert.equal(broken.verdict, "broken");
  assert.match(broken.reason, /1 past the 3/);
  assert.equal(checkOrder("overtrading", { limit: 3 }, DAY, ctx([])).verdict, "untested");
  // Trades on another day don't count.
  assert.equal(checkOrder("overtrading", { limit: 3 }, DAY, ctx([trade("2026-10-13", "09:35", 50)])).verdict, "untested");
});

test("checkOrder: revenge waits are measured from the losing exit", () => {
  // Loss exits 09:38 (3-minute hold); next entry 09:45 → 7 minutes.
  const quick = [trade(DAY, "09:35", -50), trade(DAY, "09:45", 20)];
  assert.equal(checkOrder("revenge", { minutes: 10 }, DAY, ctx(quick)).verdict, "broken");
  const patient = [trade(DAY, "09:35", -50), trade(DAY, "10:05", 20)];
  assert.equal(checkOrder("revenge", { minutes: 10 }, DAY, ctx(patient)).verdict, "kept");
  assert.equal(checkOrder("revenge", { minutes: 10 }, DAY, ctx([trade(DAY, "09:35", 50), trade(DAY, "09:40", 50)])).verdict, "untested");
  assert.equal(checkOrder("revenge", { minutes: 10 }, DAY, ctx([trade(DAY, "09:35", -50)])).verdict, "kept");
});

test("checkOrder: holding losers, sizing up, bad hours", () => {
  assert.equal(checkOrder("holding-losers", { minutes: 5 }, DAY, ctx([trade(DAY, "09:35", -50, { holdMin: 20 })])).verdict, "broken");
  assert.equal(checkOrder("holding-losers", { minutes: 5 }, DAY, ctx([trade(DAY, "09:35", -50, { holdMin: 4 })])).verdict, "kept");
  assert.equal(checkOrder("holding-losers", { minutes: 5 }, DAY, ctx([trade(DAY, "09:35", 50, { holdMin: 40 })])).verdict, "untested");

  const up = [trade(DAY, "09:35", -50, { qty: 1 }), trade(DAY, "09:55", 20, { qty: 3 })];
  assert.equal(checkOrder("sizing-up", { qty: 1 }, DAY, ctx(up)).verdict, "broken");
  const same = [trade(DAY, "09:35", -50, { qty: 1 }), trade(DAY, "09:55", 20, { qty: 1 })];
  assert.equal(checkOrder("sizing-up", { qty: 1 }, DAY, ctx(same)).verdict, "kept");

  assert.equal(checkOrder("bad-hours", { hour: 11 }, DAY, ctx([trade(DAY, "11:20", 10)])).verdict, "broken");
  assert.equal(checkOrder("bad-hours", { hour: 11 }, DAY, ctx([trade(DAY, "10:59", 10), trade(DAY, "12:00", 10)])).verdict, "kept");
});

test("checkOrder: rule breaks, mistakes, fees, preparation, self-report", () => {
  const six = Array.from({ length: 6 }, (_, i) => trade(DAY, `09:${String(30 + i * 5).padStart(2, "0")}`, 10));
  const rb = checkOrder("rule-breaks", {}, DAY, ctx(six));
  assert.equal(rb.verdict, "broken");
  assert.match(rb.reason, /^6 trades \(limit 5\)/);
  assert.equal(checkOrder("rule-breaks", {}, DAY, ctx(six.slice(0, 2))).verdict, "kept");

  assert.equal(checkOrder("mistakes", { label: "Moved stop" }, DAY, ctx([trade(DAY, "09:35", -10, { mistakes: ["moved stop"] })])).verdict, "broken");
  assert.equal(checkOrder("mistakes", { label: "Moved stop" }, DAY, ctx([trade(DAY, "09:35", -10, { mistakes: ["FOMO entry"] })])).verdict, "kept");

  assert.equal(checkOrder("fees", { limit: 5 }, DAY, ctx(six)).verdict, "broken");

  const journal = (plan: boolean): JournalDay => ({
    day: DAY, checklist: { plan }, tasks: [], readiness: null, intention: null, plan: null, review: null, wins: null,
    lessons: null, moodAfter: null, rulesKept: {}, isSample: false,
  });
  assert.equal(checkOrder("unprepared", {}, DAY, ctx(six, { journal: journal(true) })).verdict, "kept");
  assert.equal(checkOrder("unprepared", {}, DAY, ctx(six, { journal: journal(false) })).verdict, "broken");
  assert.equal(checkOrder("unprepared", {}, DAY, ctx([], { journal: null })).verdict, "untested");

  assert.equal(checkOrder("cutting-winners", {}, DAY, ctx(six)).verdict, "self");
});

test("tallyChecks counts only tested sessions", async () => {
  const { tallyChecks } = await import("../lib/analytics/observer");
  const c = (verdict: "kept" | "broken" | "untested" | "self") => ({ day: DAY, verdict, reason: "", trades: 0 });
  assert.deepEqual(tallyChecks([c("kept"), c("broken"), c("untested"), c("kept"), c("self")]), { kept: 2, broken: 1, tested: 3 });
  assert.deepEqual(tallyChecks([]), { kept: 0, broken: 0, tested: 0 });
});

test("instructionInPlace: complete only when every part is already enforced", async () => {
  const { instructionInPlace } = await import("../lib/analytics/observer");
  const ins = { rulesPatch: { maxTradesPerDay: 3 }, checklist: "Stopped at 3 trades" };
  const loose = instructionInPlace(ins, { ...RULES, maxTradesPerDay: 5 }, RITUAL);
  assert.equal(loose.complete, false);
  assert.equal(loose.done.length, 0);
  const half = instructionInPlace(ins, { ...RULES, maxTradesPerDay: 2 }, RITUAL);
  assert.equal(half.complete, false);
  assert.deepEqual(half.done, ["Rule: max 2 trades a day"]);
  const full = instructionInPlace(ins, { ...RULES, maxTradesPerDay: 3 }, [...RITUAL, { id: "x", label: "stopped at 3 trades", group: "post" }]);
  assert.equal(full.complete, true);
  // A longer cool-down already counts; a shorter one doesn't.
  assert.equal(instructionInPlace({ rulesPatch: { cooldownMinutesAfterLoss: 10 }, checklist: null }, { ...RULES, cooldownMinutesAfterLoss: 15 }, []).complete, true);
  assert.equal(instructionInPlace({ rulesPatch: { cooldownMinutesAfterLoss: 10 }, checklist: null }, { ...RULES, cooldownMinutesAfterLoss: 5 }, []).complete, false);
  // Nothing to apply is never "complete".
  assert.equal(instructionInPlace({ rulesPatch: null, checklist: null }, RULES, []).complete, false);
});
