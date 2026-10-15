import type { JournalDay, RitualItem, Trade } from "../types";
import { fmtMoney, fmtPct } from "../format";
import type { RuleReport } from "./rules";
import { dailySeries, summarize, summarizeDays } from "./stats";
import type { TiltReport } from "./tilt";
import { dayKey } from "./time";

export type Dimension = {
  key: "discipline" | "risk" | "edge" | "patience" | "consistency" | "process";
  label: string;
  weight: number;
  score: number; // 0-100
  grade: string;
  why: string;
  tip: string;
};

export type ReportCard = {
  overall: number;
  grade: string;
  dimensions: Dimension[];
  sample: number;
  lowSample: boolean;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const lerp01 = (v: number, lo: number, hi: number) => clamp01((v - lo) / (hi - lo));

export function letter(score: number): string {
  if (score >= 93) return "A+";
  if (score >= 87) return "A";
  if (score >= 82) return "A−";
  if (score >= 77) return "B+";
  if (score >= 72) return "B";
  if (score >= 67) return "B−";
  if (score >= 62) return "C+";
  if (score >= 57) return "C";
  if (score >= 52) return "C−";
  if (score >= 42) return "D";
  return "F";
}

function pfScore(pf: number): number {
  if (!Number.isFinite(pf)) return pf > 0 ? 1 : 0;
  if (pf < 0.5) return 0;
  if (pf < 1) return 0.4 * lerp01(pf, 0.5, 1);
  if (pf < 1.5) return 0.4 + 0.3 * lerp01(pf, 1, 1.5);
  if (pf < 2) return 0.7 + 0.15 * lerp01(pf, 1.5, 2);
  return 0.85 + 0.15 * lerp01(pf, 2, 3);
}

/**
 * The Report Card is weighted toward what you control (process) rather than
 * what the market gave you (outcome). This is what you're being judged on.
 */
export function buildReportCard(args: {
  trades: Trade[];
  rules: RuleReport;
  tilt: TiltReport;
  journals: JournalDay[];
  ritual: RitualItem[];
  tz: string;
}): ReportCard {
  const { trades, rules, tilt, journals, ritual, tz } = args;
  const s = summarize(trades);
  const days = summarizeDays(dailySeries(trades, tz));
  const n = trades.length;

  // Discipline — auto-enforced rules (+ manual rule check-offs if used).
  const violating = trades.filter((t) => rules.violatingTradeIds.has(t.id)).length;
  const autoShare = n ? 1 - violating / n : 1;
  const manual = journals.flatMap((j) => Object.values(j.rulesKept ?? {}));
  const manualShare = manual.length ? manual.filter(Boolean).length / manual.length : null;
  const discipline = manualShare === null ? autoShare : autoShare * 0.7 + manualShare * 0.3;
  const topBreak = rules.byRule[0];

  // Risk — payoff ratio and tail control.
  const payoffScore = s.losses === 0 ? (s.wins ? 1 : 0.5) : clamp01(s.payoff / 2);
  const tailRatio = s.avgLoss ? Math.abs(s.largestLoss) / s.avgLoss : 1;
  const tailScore = s.losses ? lerp01(5 - tailRatio, 0, 3) : 1;
  const risk = payoffScore * 0.5 + tailScore * 0.5;

  // Edge — profit factor.
  const edge = n ? pfScore(s.profitFactor) : 0;

  // Patience — revenge trades and overtrading.
  const tiltShare = n ? tilt.flaggedIds.size / n : 0;
  const overShare = days.tradingDays ? tilt.overtradingDays.length / days.tradingDays : 0;
  const patience = clamp01(1 - tiltShare * 3 - overShare);

  // Consistency — green-day ratio and dependence on one big day.
  const greenRatio = days.tradingDays ? days.greenDays / days.tradingDays : 0;
  const greenScore = lerp01(greenRatio, 0.3, 0.7);
  const concentration = days.bestDayShare;
  const concScore = concentration === null ? 0.4 : lerp01(0.6 - concentration, 0, 0.3);
  const consistency = greenScore * 0.6 + concScore * 0.4;

  // Process — preparation and reflection on trading days.
  const tradingDays = new Set(trades.map((t) => dayKey(t.entryTime, tz)));
  const jMap = new Map(journals.map((j) => [j.day, j]));
  const pre = ritual.filter((r) => r.group === "pre");
  let prepSum = 0, reflectSum = 0;
  for (const d of tradingDays) {
    const j = jMap.get(d);
    const preDone = pre.length ? pre.filter((r) => j?.checklist?.[r.id]).length / pre.length : j?.readiness ? 1 : 0;
    prepSum += preDone;
    const wrote = (j?.review?.trim().length ?? 0) >= 15 || (j?.lessons?.trim().length ?? 0) >= 15;
    reflectSum += wrote ? 1 : 0;
  }
  const td = tradingDays.size;
  const prep = td ? prepSum / td : 0;
  const reflect = td ? reflectSum / td : 0;
  const process = (prep + reflect) / 2;

  const dims: Omit<Dimension, "grade">[] = [
    {
      key: "discipline",
      label: "Discipline",
      weight: 0.25,
      score: Math.round(discipline * 100),
      why: n ? `${violating} of ${n} trades broke one of your rules (${fmtPct(1 - autoShare)}).` : "No trades in this period.",
      tip: topBreak
        ? `Most frequent break: ${topBreak.label.toLowerCase()} — it netted ${fmtMoney(topBreak.pnl, { sign: true })}.`
        : "Clean sheet. Keep the rules exactly as they are.",
    },
    {
      key: "risk",
      label: "Risk control",
      weight: 0.2,
      score: Math.round(risk * 100),
      why: s.losses
        ? `Avg win ${fmtMoney(s.avgWin)} vs avg loss ${fmtMoney(s.avgLoss)} (${s.payoff.toFixed(2)}R). Worst loss was ${tailRatio.toFixed(1)}× a normal loss.`
        : "No losing trades yet.",
      tip: tailRatio > 2.5 ? "Your biggest losses are outliers — use a hard stop on every entry." : s.payoff < 1 ? "Let winners breathe: trail stops instead of grabbing the first tick of profit." : "Your loss size is under control.",
    },
    {
      key: "edge",
      label: "Edge",
      weight: 0.15,
      score: Math.round(edge * 100),
      why: n ? `Profit factor ${Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"}, ${fmtPct(s.winRate)} win rate, ${fmtMoney(s.expectancy, { sign: true })} per trade.` : "No trades in this period.",
      tip: s.profitFactor < 1 ? "Trade only your best setup for a week to rebuild a positive edge." : "Size up only your A+ setup — not everything.",
    },
    {
      key: "patience",
      label: "Patience",
      weight: 0.15,
      score: Math.round(patience * 100),
      why: `${tilt.flaggedIds.size} revenge-style trade${tilt.flaggedIds.size === 1 ? "" : "s"} (${fmtMoney(tilt.tiltCost, { sign: true })}) and ${tilt.overtradingDays.length} overtrading day${tilt.overtradingDays.length === 1 ? "" : "s"}.`,
      tip: tilt.medianReentryAfterLoss !== null && tilt.medianReentryAfterLoss < 5
        ? `You re-enter ${Math.round(tilt.medianReentryAfterLoss)}m after a loss on average. Stand up and walk for 10 minutes after every loss.`
        : tiltShare > 0.1
          ? "After a loss you tend to size up or keep pressing. Set a hard rule: after any loss, the next trade is minimum size."
          : overShare > 0.15
            ? "Your busiest days are your worst. Cap your trades per day and stop when you hit it."
            : "Your pacing after losses is healthy.",
    },
    {
      key: "consistency",
      label: "Consistency",
      weight: 0.1,
      score: Math.round(consistency * 100),
      why: days.tradingDays
        ? `${days.greenDays}/${days.tradingDays} green days${concentration !== null ? `; best day is ${fmtPct(concentration)} of profit` : ""}.`
        : "No trading days.",
      tip: concentration !== null && concentration > 0.5 ? "One day is carrying your results — aim for smaller, repeatable green days." : "Protect green days: stop once you're up your average day.",
    },
    {
      key: "process",
      label: "Prep & reflection",
      weight: 0.15,
      score: Math.round(process * 100),
      why: td ? `Pre-market ritual ${fmtPct(prep)} complete; reviewed ${Math.round(reflect * td)} of ${td} trading days.` : "No trading days to review.",
      tip: reflect < 0.8 ? "Write three lines after every session — the AI coach gets sharper with every entry." : "Elite habit. Keep the reviews honest.",
    },
  ];

  const overall = Math.round(dims.reduce((sum, d) => sum + d.score * d.weight, 0));
  return {
    overall,
    grade: letter(overall),
    dimensions: dims.map((d) => ({ ...d, grade: letter(d.score) })),
    sample: n,
    lowSample: n < 10,
  };
}
