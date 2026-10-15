import type { JournalDay, Trade } from "../types";
import { fmtHold } from "./time";
import { fmtMoney, fmtPct } from "../format";
import type { RuleReport } from "./rules";
import {
  byDirection,
  byEmotion,
  byHour,
  byMistake,
  bySetup,
  bySymbol,
  byTradeNumber,
  byWeekday,
  dailySeries,
  summarize,
  type Bucket,
} from "./stats";
import type { TiltReport } from "./tilt";

export type Insight = {
  id: string;
  kind: "strength" | "leak" | "note";
  title: string;
  detail: string;
  impact: number; // dollars, signed (positive = helps you)
  confidence: "low" | "medium" | "high";
};

const MIN_BUCKET = 5;

function confidence(n: number): Insight["confidence"] {
  return n >= 30 ? "high" : n >= 12 ? "medium" : "low";
}

function bestAndWorst(buckets: Bucket[]) {
  const eligible = buckets.filter((b) => b.trades >= MIN_BUCKET);
  if (eligible.length < 2) return null;
  const sorted = [...eligible].sort((a, b) => b.expectancy - a.expectancy);
  return { best: sorted[0]!, worst: sorted[sorted.length - 1]! };
}

/**
 * Deterministic pattern detectors. Every insight carries its sample size and
 * dollar impact so you know how much to trust it — no vague horoscope advice.
 */
export function generateInsights(args: {
  trades: Trade[];
  rules: RuleReport;
  tilt: TiltReport;
  journals: JournalDay[];
  tz: string;
}): Insight[] {
  const { trades, rules, tilt, journals, tz } = args;
  const out: Insight[] = [];
  if (trades.length < 5) return out;
  const s = summarize(trades);

  const bw = (id: string, noun: string, buckets: Bucket[], fmt: (b: Bucket) => string) => {
    const r = bestAndWorst(buckets);
    if (!r) return;
    if (r.best.expectancy > 0 && r.best.expectancy > s.expectancy) {
      out.push({
        id: `${id}-best`,
        kind: "strength",
        title: `${fmt(r.best)} is your ${noun}`,
        detail: `${fmtMoney(r.best.expectancy, { sign: true })} per trade over ${r.best.trades} trades (${fmtPct(r.best.winRate)} win rate) — ${fmtMoney(r.best.net, { sign: true })} total.`,
        impact: r.best.net,
        confidence: confidence(r.best.trades),
      });
    }
    if (r.worst.expectancy < 0 && r.worst.key !== r.best.key) {
      out.push({
        id: `${id}-worst`,
        kind: "leak",
        title: `${fmt(r.worst)} is costing you`,
        detail: `${fmtMoney(r.worst.expectancy, { sign: true })} per trade over ${r.worst.trades} trades (${fmtPct(r.worst.winRate)} win rate) — ${fmtMoney(r.worst.net, { sign: true })} total.`,
        impact: r.worst.net,
        confidence: confidence(r.worst.trades),
      });
    }
  };

  bw("hour", "power hour", byHour(trades, tz), (b) => `The ${b.label} hour`);
  bw("weekday", "best day of the week", byWeekday(trades, tz), (b) => `${b.label}`);
  bw("setup", "money setup", bySetup(trades), (b) => `“${b.label}”`);
  bw("symbol", "best market", bySymbol(trades), (b) => b.label);
  bw("emotion", "best headspace", byEmotion(trades), (b) => `Trading while ${b.label.toLowerCase()}`);

  // Long vs short.
  const dir = byDirection(trades);
  if (dir.length === 2 && dir.every((d) => d.trades >= MIN_BUCKET)) {
    const [a, b] = [...dir].sort((x, y) => y.expectancy - x.expectancy);
    if (a!.expectancy > 0 && b!.expectancy < 0) {
      out.push({
        id: "direction",
        kind: "note",
        title: `You're a ${a!.label.toLowerCase()} trader`,
        detail: `${a!.label}s: ${fmtMoney(a!.expectancy, { sign: true })}/trade. ${b!.label}s: ${fmtMoney(b!.expectancy, { sign: true })}/trade across ${b!.trades} trades.`,
        impact: -b!.net,
        confidence: confidence(Math.min(a!.trades, b!.trades)),
      });
    }
  }

  // Edge decay through the day.
  const nums = byTradeNumber(trades, tz);
  const early = nums.filter((b) => Number(b.key) <= 2);
  const late = nums.filter((b) => Number(b.key) >= 3);
  const earlyN = early.reduce((x, b) => x + b.trades, 0);
  const lateN = late.reduce((x, b) => x + b.trades, 0);
  if (earlyN >= MIN_BUCKET && lateN >= MIN_BUCKET) {
    const earlyNet = early.reduce((x, b) => x + b.net, 0);
    const lateNet = late.reduce((x, b) => x + b.net, 0);
    if (earlyNet > 0 && lateNet < 0) {
      out.push({
        id: "decay",
        kind: "leak",
        title: "Your edge expires after trade #2",
        detail: `First two trades of the day: ${fmtMoney(earlyNet, { sign: true })}. Trades 3+: ${fmtMoney(lateNet, { sign: true })} over ${lateN} trades.`,
        impact: lateNet,
        confidence: confidence(lateN),
      });
    }
  }

  // Holding losers longer than winners.
  if (s.wins >= MIN_BUCKET && s.losses >= MIN_BUCKET && s.avgHoldWin > 0) {
    const ratio = s.avgHoldLoss / s.avgHoldWin;
    if (ratio >= 1.5) {
      out.push({
        id: "hold",
        kind: "leak",
        title: `You hold losers ${ratio.toFixed(1)}× longer than winners`,
        detail: `Winners: ${fmtHold(s.avgHoldWin)} on average. Losers: ${fmtHold(s.avgHoldLoss)}. Hope is not a stop loss.`,
        impact: -s.totalLost * 0.15,
        confidence: confidence(Math.min(s.wins, s.losses)),
      });
    } else if (ratio <= 0.7) {
      out.push({
        id: "hold",
        kind: "strength",
        title: "You cut losers fast",
        detail: `Losers last ${fmtHold(s.avgHoldLoss)} vs ${fmtHold(s.avgHoldWin)} for winners — textbook.`,
        impact: s.totalLost * 0.1,
        confidence: confidence(Math.min(s.wins, s.losses)),
      });
    }
  }

  // Tilt.
  if (tilt.flaggedIds.size >= 3) {
    out.push({
      id: "tilt",
      kind: tilt.tiltCost < 0 ? "leak" : "note",
      title: tilt.tiltCost < 0 ? `Revenge trades cost you ${fmtMoney(-tilt.tiltCost)}` : "Revenge trades are a coin flip",
      detail: `${tilt.flaggedIds.size} trades taken in a tilt pattern won ${fmtPct(tilt.flaggedWinRate)} vs ${fmtPct(tilt.cleanWinRate)} for the rest.`,
      impact: tilt.tiltCost,
      confidence: confidence(tilt.flaggedIds.size),
    });
  }

  // Rule breaks.
  if (rules.violatingTradeIds.size >= 2) {
    out.push({
      id: "rules",
      kind: rules.breakPnl < 0 ? "leak" : "note",
      title: rules.breakPnl < 0 ? `Breaking your rules cost ${fmtMoney(-rules.breakPnl)}` : "Rule breaks got lucky — for now",
      detail: `${rules.violatingTradeIds.size} rule-breaking trades netted ${fmtMoney(rules.breakPnl, { sign: true })}; your rule-abiding trades netted ${fmtMoney(rules.cleanPnl, { sign: true })}.`,
      impact: rules.breakPnl,
      confidence: confidence(rules.violatingTradeIds.size),
    });
  }

  // Most expensive mistake tag.
  const mistakes = byMistake(trades).filter((m) => m.trades >= 2 && m.net < 0);
  if (mistakes[0]) {
    out.push({
      id: "mistake",
      kind: "leak",
      title: `“${mistakes[0].label}” is your most expensive habit`,
      detail: `${mistakes[0].trades} tagged trades, ${fmtMoney(mistakes[0].net, { sign: true })} total.`,
      impact: mistakes[0].net,
      confidence: confidence(mistakes[0].trades),
    });
  }

  // Fees drag.
  if (s.gross > 0 && s.fees / s.gross > 0.25) {
    out.push({
      id: "fees",
      kind: "leak",
      title: `Commissions ate ${fmtPct(s.fees / s.gross)} of your gross`,
      detail: `${fmtMoney(s.fees)} in fees on ${fmtMoney(s.gross)} gross profit. Fewer, better trades keep more of it.`,
      impact: -s.fees,
      confidence: "high",
    });
  }

  // Mind ↔ market: readiness and ritual vs P&L.
  const dayNet = new Map(dailySeries(trades, tz).map((d) => [d.day, d.net]));
  const ready = journals.filter((j) => j.readiness && dayNet.has(j.day));
  if (ready.length >= 6) {
    const score = (j: JournalDay) => (j.readiness!.sleep + j.readiness!.energy + j.readiness!.focus + j.readiness!.mood) / 4;
    const hi = ready.filter((j) => score(j) >= 3.75);
    const lo = ready.filter((j) => score(j) <= 2.75);
    if (hi.length >= 3 && lo.length >= 2) {
      const avg = (js: JournalDay[]) => js.reduce((x, j) => x + (dayNet.get(j.day) ?? 0), 0) / js.length;
      const hiAvg = avg(hi), loAvg = avg(lo);
      if (hiAvg - loAvg > 50) {
        out.push({
          id: "readiness",
          kind: "note",
          title: "Your mind is your edge",
          detail: `On high-readiness days you average ${fmtMoney(hiAvg, { sign: true })}; on low-readiness days ${fmtMoney(loAvg, { sign: true })}. Low score? Trade smaller or sit out.`,
          impact: (hiAvg - loAvg) * lo.length,
          confidence: confidence(ready.length),
        });
      }
    }
  }

  return out.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}
