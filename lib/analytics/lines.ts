/**
 * The facts each page's closing line is written from, and the plain line used
 * until (or instead of) an AI one. Pure functions, so they're unit-tested.
 */
import type { JournalDay, Settings, Trade } from "../types";
import { fmtMoney } from "../format";
import { generateInsights } from "./insights";
import type { LedgerSummary } from "./ledger";
import type { MindSummary } from "./mind";
import type { Road } from "./road";
import { evaluateRules } from "./rules";
import { byHour, summarize } from "./stats";
import { detectTilt } from "./tilt";
import { addDays, dayKey } from "./time";

export type Line = { line: string; cite: string };

const pct = (x: number) => Math.round(x * 100);
const r = (x: number) => Math.round(x);

/** Insights: the last 90 days, the best and worst hour, and what the insight engine found. */
export function insightsFacts(trades: Trade[], journals: JournalDay[], settings: Settings, today: string): { facts: Record<string, unknown>; fallback: Line } {
  const tz = settings.profile.timezone;
  const from = addDays(today, -90);
  const recent = trades.filter((t) => dayKey(t.exitTime, tz) >= from);
  const js = journals.filter((j) => j.day >= from);
  const s = summarize(recent, settings.rules.defaultRisk);
  const insights = generateInsights({ trades: recent, rules: evaluateRules(recent, settings.rules, tz), tilt: detectTilt(recent, tz), journals: js, tz });
  const hours = byHour(recent, tz).filter((b) => b.trades >= 5);
  const best = [...hours].sort((a, b) => b.net - a.net)[0];
  const worst = [...hours].sort((a, b) => a.net - b.net)[0];
  const facts = {
    window: "last 90 days",
    trades: s.trades,
    net: r(s.net),
    winRate: pct(s.winRate),
    profitFactor: Number.isFinite(s.profitFactor) ? Math.round(s.profitFactor * 100) / 100 : "no losses",
    bestHour: best ? { hour: best.label, net: r(best.net), trades: best.trades } : null,
    worstHour: worst && worst !== best ? { hour: worst.label, net: r(worst.net), trades: worst.trades } : null,
    findings: insights.slice(0, 5).map((i) => ({ kind: i.kind, title: i.title, detail: i.detail })),
  };
  const top = insights[0];
  const fallback: Line = top
    ? { line: top.title.replace(/[.!]?$/, "."), cite: "your last 90 days" }
    : s.trades
      ? { line: `${s.trades} trades, ${pct(s.winRate)}% won, ${fmtMoney(s.net, { sign: true })} over the last 90 days.`, cite: "your last 90 days" }
      : { line: "The edge is everything you don't do.", cite: "the edge" };
  return { facts, fallback };
}

/** Guardian: the scoreboard, the road to paid, and how the feelings line up with the money. */
export function guardianFacts(s: LedgerSummary, road: Road, mind: MindSummary): { facts: Record<string, unknown>; fallback: Line } {
  const decided = s.passed + s.blown;
  const facts = {
    evalsBought: s.evals,
    passed: s.passed,
    blown: s.blown,
    passRate: s.passRate === null ? null : pct(s.passRate),
    fundedLive: s.liveFunded,
    fundedLost: s.fundedBlown,
    payouts: s.payouts,
    paidOut: r(s.paidOut),
    fees: r(s.cost),
    net: r(s.net),
    feesPerFundedAccount: s.costPerFunded === null ? null : r(s.costPerFunded),
    daysToPass: road.daysToPass.median,
    daysPassedToFirstPayout: road.daysPassToPayout.median,
    byFirm: s.byFirm.map((f) => ({ firm: f.firm, bought: f.evals, passed: f.passed, blown: f.blown, payouts: f.payouts, net: r(f.net) })),
    averageDayByFeel: Object.fromEntries(mind.buckets.filter((b) => b.days >= 3).map((b) => [b.feel, { days: b.days, avg: b.avgNet === null ? null : r(b.avgNet) }])),
    lifeTags: mind.tags.slice(0, 3).map((t) => ({ tag: t.tag, days: t.days, avg: r(t.avgNet), otherDays: t.otherAvg === null ? null : r(t.otherAvg) })),
  };
  let fallback: Line = { line: "The cheapest evaluation is the one you don't buy twice.", cite: "Guardian" };
  if (decided > 0) {
    const money = s.paidOut > 0 ? ` ${fmtMoney(s.paidOut)} paid out against ${fmtMoney(s.cost)} in fees.` : " The first payout changes everything.";
    fallback = { line: `${s.passed} of ${decided} evals passed — ${pct(s.passed / decided)}%.${money}`, cite: "your ledger" };
  } else if (s.evals > 0) {
    fallback = { line: `${s.evals} ${s.evals === 1 ? "eval" : "evals"} bought and ${fmtMoney(s.cost)} spent — mark each one passed or blown as it lands.`, cite: "your ledger" };
  }
  return { facts, fallback };
}
