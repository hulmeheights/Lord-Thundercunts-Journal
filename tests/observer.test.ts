import { test } from "node:test";
import assert from "node:assert/strict";
import type { JournalDay, PropSettings, RitualItem, Trade, TradingRules } from "../lib/types";
import { evaluateRules } from "../lib/analytics/rules";
import { detectTilt } from "../lib/analytics/tilt";
import { buildDossier, observerName, perceptionGap } from "../lib/analytics/observer";

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
    grossPnl: net, fees: 0, netPnl: net, pointValue: 2, fillCount: 2, setup: null, tags: [], mistakes: [],
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
