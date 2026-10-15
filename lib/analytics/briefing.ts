import type { Capsule, JournalDay, PropSettings, Readiness, Settings, Trade } from "../types";
import { generateInsights, type Insight } from "./insights";
import { propStatus, simulateProp } from "./prop";
import { buildReportCard, type ReportCard } from "./reportcard";
import { ringStreak, ringsForDay, type Rings } from "./rings";
import { evaluateRules, type RuleReport } from "./rules";
import { dailySeries, equityCurve, inRange, sortByExit, summarize, summarizeDays } from "./stats";
import { detectTilt } from "./tilt";
import {
  addDays,
  addMonths,
  dayKey,
  eachDay,
  endOfMonth,
  holdMinutes,
  longDate,
  monthLabel,
  shortDate,
  startOfMonth,
  startOfWeek,
  timeInTz,
  todayKey,
} from "./time";
import { fmtMoney, fmtPct } from "../format";

export type Period = "daily" | "weekly" | "monthly";
export const PERIODS: Period[] = ["daily", "weekly", "monthly"];

export type BriefingWindow = {
  id: string;
  period: Period;
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  title: string;
  label: string;
};

export type SlideTrade = {
  id: string;
  symbol: string;
  direction: "long" | "short";
  qty: number;
  entryPrice: number;
  exitPrice: number;
  netPnl: number;
  setup: string | null;
  notes: string | null;
  mistakes: string[];
  hold: number;
  time: string;
  day: string;
};

export type Slide =
  | { kind: "cover"; title: string; label: string; net: number; trades: number; winRate: number; rest: boolean }
  | { kind: "money"; made: number; lost: number; fees: number; net: number; wins: number; losses: number }
  | { kind: "scoreboard"; stats: { label: string; value: string; delta?: string; tone?: "pos" | "neg" | "flat" }[] }
  | { kind: "curve"; points: number[]; net: number; maxDrawdown: number; caption: string }
  | { kind: "trade"; variant: "best" | "worst"; trade: SlideTrade }
  | { kind: "calendar"; days: { day: string; net: number | null }[]; green: number; red: number }
  | { kind: "insight"; variant: "edge" | "leak"; insight: Insight }
  | {
      kind: "discipline";
      rings: Rings;
      violations: { label: string; pnl: number; count: number }[];
      breakPnl: number;
      cleanPnl: number;
      tiltCount: number;
      tiltCost: number;
      streak: number;
    }
  | { kind: "reportcard"; card: ReportCard }
  | {
      kind: "guardian";
      cushion: number;
      cushionPct: number;
      profit: number;
      targetProgress: number | null;
      passProb: number | null;
      bustProb: number | null;
      consistencyShare: number | null;
      consistencyPct: number | null;
      phase: PropSettings["phase"];
    }
  | { kind: "mind"; readiness: Readiness | null; ritualPct: number; intention: string | null; moodAfter: number | null }
  | { kind: "ai" }
  | { kind: "capsule"; capsule: Capsule }
  | { kind: "focus"; text: string; why: string }
  | { kind: "outro"; streak: number; period: Period; day: string };

export type Briefing = {
  window: BriefingWindow;
  slides: Slide[];
  hash: string;
  aiContext: Record<string, unknown>;
};

function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Decide which day/week/month a briefing covers. */
export function resolveWindow(period: Period, tz: string, trades: Trade[], requested?: string | null): BriefingWindow {
  const today = todayKey(tz);
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : null;
  const tradeDays = new Set(trades.map((t) => dayKey(t.exitTime, tz)));

  if (period === "daily") {
    let day = date ?? today;
    if (!date && !tradeDays.has(today)) {
      for (let i = 1; i <= 10; i++) {
        const d = addDays(today, -i);
        if (tradeDays.has(d)) { day = d; break; }
      }
    }
    return {
      id: `daily:${day}`,
      period,
      start: day,
      end: day,
      prevStart: addDays(day, -1),
      prevEnd: addDays(day, -1),
      title: day === today ? "Today" : day === addDays(today, -1) ? "Yesterday" : "Daily Briefing",
      label: longDate(day),
    };
  }

  if (period === "weekly") {
    let start = startOfWeek(date ?? today);
    if (!date) {
      const has = eachDay(start, addDays(start, 6)).some((d) => tradeDays.has(d));
      if (!has) start = addDays(start, -7);
    }
    const end = addDays(start, 6);
    return {
      id: `weekly:${start}`,
      period,
      start,
      end,
      prevStart: addDays(start, -7),
      prevEnd: addDays(start, -1),
      title: start === startOfWeek(today) ? "This Week" : "Weekly Briefing",
      label: `${shortDate(start)} – ${shortDate(end)}`,
    };
  }

  let start = startOfMonth(date ?? today);
  if (!date) {
    const has = eachDay(start, endOfMonth(start)).some((d) => tradeDays.has(d));
    if (!has) start = addMonths(start, -1);
  }
  const prevStart = addMonths(start, -1);
  return {
    id: `monthly:${start}`,
    period,
    start,
    end: endOfMonth(start),
    prevStart,
    prevEnd: endOfMonth(prevStart),
    title: start === startOfMonth(today) ? "This Month" : "Monthly Briefing",
    label: monthLabel(start),
  };
}

function toSlideTrade(t: Trade, tz: string): SlideTrade {
  return {
    id: t.id,
    symbol: t.symbol,
    direction: t.direction,
    qty: t.qty,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    netPnl: t.netPnl,
    setup: t.setup,
    notes: t.notes,
    mistakes: t.mistakes,
    hold: holdMinutes(t.entryTime, t.exitTime),
    time: timeInTz(t.entryTime, tz),
    day: dayKey(t.entryTime, tz),
  };
}

const FOCUS_BY_INSIGHT: Record<string, (i: Insight) => string> = {
  "hour-worst": (i) => `${i.title.replace(" is costing you", "")}: you don't trade it. Close the platform.`,
  "weekday-worst": () => "Half size on your worst weekday — or take it off completely.",
  "setup-worst": (i) => `${i.title.replace(" is costing you", "")} is benched until it earns its spot back.`,
  "symbol-worst": (i) => `${i.title.replace(" is costing you", "")} is off the menu. Trade your best market only.`,
  "emotion-worst": () => "Name your emotion before every entry. If it's not calm, it's not a trade.",
  decay: () => "Two trades. Then you're done for the day — win or lose.",
  hold: () => "Your stop is a promise. The moment it's hit, you're out.",
  tilt: () => "After any loss: stand up, walk for ten minutes, then decide.",
  rules: () => "Every rule, every trade. No exceptions tomorrow.",
  mistake: (i) => `No “${i.title.split("”")[0]!.replace("“", "")}” tomorrow. Catch it before you click.`,
  fees: () => "Fewer trades, better trades. Quality over clicks.",
};

export function buildBriefing(args: {
  window: BriefingWindow;
  trades: Trade[]; // recent history (e.g. last 120 days)
  journals: JournalDay[];
  capsules: Capsule[];
  settings: Settings;
}): Briefing {
  const { window: w, settings, capsules } = args;
  const tz = settings.profile.timezone;
  const allTrades = args.trades;
  const trades = sortByExit(inRange(allTrades, tz, w.start, w.end));
  const prev = inRange(allTrades, tz, w.prevStart, w.prevEnd);
  const journals = args.journals.filter((j) => j.day >= w.start && j.day <= w.end);
  const jMap = new Map(args.journals.map((j) => [j.day, j]));
  const s = summarize(trades);
  const ps = summarize(prev);
  const days = dailySeries(trades, tz);
  const daySummary = summarizeDays(days);
  const rules = evaluateRules(trades, settings.rules, tz);
  const tilt = detectTilt(trades, tz);
  const insights = generateInsights({ trades, rules, tilt, journals, tz });
  const card = buildReportCard({ trades, rules, tilt, journals, ritual: settings.ritual, tz });
  const allRules: RuleReport = evaluateRules(allTrades.filter((t) => dayKey(t.exitTime, tz) >= addDays(w.end, -60)), settings.rules, tz);
  const streak = ringStreak(w.end, jMap, settings.ritual, allTrades, allRules, tz);
  const rest = trades.length === 0;
  const slides: Slide[] = [];

  slides.push({ kind: "cover", title: w.title, label: w.label, net: s.net, trades: s.trades, winRate: s.winRate, rest });

  if (!rest) {
    slides.push({ kind: "money", made: s.totalWon, lost: s.totalLost, fees: s.fees, net: s.net, wins: s.wins, losses: s.losses });

    const delta = (cur: number, before: number, fmt: (n: number) => string) =>
      ps.trades ? (cur - before >= 0 ? `▲ ${fmt(Math.abs(cur - before))}` : `▼ ${fmt(Math.abs(cur - before))}`) : undefined;
    slides.push({
      kind: "scoreboard",
      stats: [
        { label: "Win rate", value: fmtPct(s.winRate), delta: delta(s.winRate, ps.winRate, (n) => `${Math.round(n * 100)} pts`), tone: s.winRate >= 0.5 ? "pos" : "neg" },
        { label: "Profit factor", value: Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞", tone: s.profitFactor >= 1 ? "pos" : "neg" },
        { label: "Per trade", value: fmtMoney(s.expectancy, { sign: true }), delta: delta(s.expectancy, ps.expectancy, (n) => fmtMoney(n)), tone: s.expectancy >= 0 ? "pos" : "neg" },
        { label: "Avg win / loss", value: `${fmtMoney(s.avgWin)} / ${fmtMoney(s.avgLoss)}`, tone: s.payoff >= 1 ? "pos" : "neg" },
      ],
    });

    const curvePoints = w.period === "daily" ? equityCurve(trades).map((p) => p.cum) : days.map((d) => d.cum);
    slides.push({
      kind: "curve",
      points: [0, ...curvePoints],
      net: s.net,
      maxDrawdown: s.maxDrawdown,
      caption: w.period === "daily" ? "Trade by trade" : "Day by day",
    });

    if (w.period !== "daily") {
      const span = eachDay(w.start, w.end);
      const netByDay = new Map(days.map((d) => [d.day, d.net]));
      slides.push({
        kind: "calendar",
        days: span.map((d) => ({ day: d, net: netByDay.has(d) ? netByDay.get(d)! : null })),
        green: daySummary.greenDays,
        red: daySummary.redDays,
      });
    }

    const best = [...trades].sort((a, b) => b.netPnl - a.netPnl)[0];
    const worst = [...trades].sort((a, b) => a.netPnl - b.netPnl)[0];
    if (best && best.netPnl > 0) slides.push({ kind: "trade", variant: "best", trade: toSlideTrade(best, tz) });
    if (worst && worst.netPnl < 0 && worst.id !== best?.id) slides.push({ kind: "trade", variant: "worst", trade: toSlideTrade(worst, tz) });

    const edge = insights.find((i) => i.kind === "strength");
    const leak = insights.find((i) => i.kind === "leak");
    if (edge) slides.push({ kind: "insight", variant: "edge", insight: edge });
    if (leak) slides.push({ kind: "insight", variant: "leak", insight: leak });
  }

  // Daily: that day's rings. Weekly/monthly: the average across days you traded or journaled.
  const lastDay = w.end > todayKey(tz) ? todayKey(tz) : w.end;
  const entriesByDay = new Map<string, number>();
  for (const t of trades) {
    const d = dayKey(t.entryTime, tz);
    entriesByDay.set(d, (entriesByDay.get(d) ?? 0) + 1);
  }
  const ringDays = w.period === "daily"
    ? [w.end]
    : eachDay(w.start, lastDay).filter((d) => entriesByDay.has(d) || jMap.has(d));
  const perDay = (ringDays.length ? ringDays : [lastDay]).map((d) =>
    ringsForDay(d, jMap.get(d), settings.ritual, entriesByDay.get(d) ?? 0, rules.byDay.get(d)?.violating ?? 0),
  );
  const avg = (k: keyof Rings) => perDay.reduce((x, r) => x + r[k], 0) / perDay.length;
  const rings: Rings = { prepare: avg("prepare"), discipline: avg("discipline"), reflect: avg("reflect") };
  slides.push({
    kind: "discipline",
    rings,
    violations: rules.byRule.map((r) => ({ label: r.label, pnl: r.pnl, count: r.count })),
    breakPnl: rules.breakPnl,
    cleanPnl: rules.cleanPnl,
    tiltCount: tilt.flaggedIds.size,
    tiltCost: tilt.tiltCost,
    streak,
  });

  if (w.period === "daily") {
    const j = jMap.get(w.end);
    const ritualTotal = settings.ritual.length;
    const done = settings.ritual.filter((r) => j?.checklist?.[r.id]).length;
    slides.push({
      kind: "mind",
      readiness: j?.readiness ?? null,
      ritualPct: ritualTotal ? done / ritualTotal : 0,
      intention: j?.intention ?? null,
      moodAfter: j?.moodAfter ?? null,
    });
  }

  if (!rest && trades.length >= 3) slides.push({ kind: "reportcard", card });

  if (settings.prop.enabled) {
    const st = propStatus(allTrades, settings.prop, tz);
    const mc = simulateProp(st, settings.prop, { sims: 2000 });
    slides.push({
      kind: "guardian",
      cushion: st.cushion,
      cushionPct: st.cushionPct,
      profit: st.profit,
      targetProgress: st.targetProgress,
      passProb: settings.prop.profitTarget != null ? (mc?.passProb ?? null) : null,
      bustProb: mc?.bustProb ?? null,
      consistencyShare: st.consistencyShare,
      consistencyPct: settings.prop.consistencyPct,
      phase: settings.prop.phase,
    });
  }

  slides.push({ kind: "ai" });

  const due = capsules.filter((c) => c.deliverOn <= todayKey(tz) && c.deliverOn >= addDays(w.start, -3));
  if (due[0]) slides.push({ kind: "capsule", capsule: due[0] });

  const topLeak = insights.find((i) => i.kind === "leak");
  const focusText = topLeak && FOCUS_BY_INSIGHT[topLeak.id] ? FOCUS_BY_INSIGHT[topLeak.id]!(topLeak) : rest
    ? "Rest is part of the job. Prepare your levels and your mind."
    : "Same process. Same rules. Let the edge play out.";
  slides.push({ kind: "focus", text: focusText, why: topLeak ? topLeak.title : "No major leaks detected — protect the process." });

  slides.push({ kind: "outro", streak, period: w.period, day: w.end });

  const hash = hashString(
    JSON.stringify([
      trades.map((t) => [t.id, Math.round(t.netPnl * 100), t.setup, t.mistakes.length]),
      journals.map((j) => [j.day, j.review?.length ?? 0, Object.keys(j.checklist).length, j.readiness ? 1 : 0]),
      settings.prop.enabled,
    ]),
  );

  const aiContext = {
    period: w.period,
    window: `${w.title} — ${w.label}`,
    summary: {
      net: round(s.net),
      trades: s.trades,
      winRate: round(s.winRate, 3),
      profitFactor: Number.isFinite(s.profitFactor) ? round(s.profitFactor) : "no losses",
      expectancy: round(s.expectancy),
      avgWin: round(s.avgWin),
      avgLoss: round(s.avgLoss),
      totalWon: round(s.totalWon),
      totalLost: round(s.totalLost),
      fees: round(s.fees),
      maxDrawdown: round(s.maxDrawdown),
      greenDays: daySummary.greenDays,
      redDays: daySummary.redDays,
    },
    previousPeriod: ps.trades ? { net: round(ps.net), trades: ps.trades, winRate: round(ps.winRate, 3) } : null,
    reportCard: { overall: card.overall, grade: card.grade, dimensions: card.dimensions.map((d) => ({ dim: d.label, score: d.score, why: d.why })) },
    insights: insights.slice(0, 8).map((i) => ({ kind: i.kind, title: i.title, detail: i.detail, confidence: i.confidence })),
    ruleBreaks: rules.byRule.map((r) => ({ rule: r.label, count: r.count, pnl: round(r.pnl) })),
    tilt: { revengeTrades: tilt.flaggedIds.size, cost: round(tilt.tiltCost), medianReentryMinAfterLoss: tilt.medianReentryAfterLoss },
    trades: trades.slice(-25).map((t) => ({
      time: `${dayKey(t.entryTime, tz)} ${timeInTz(t.entryTime, tz)}`,
      symbol: t.root,
      dir: t.direction,
      qty: t.qty,
      net: round(t.netPnl),
      holdMin: round(holdMinutes(t.entryTime, t.exitTime), 1),
      setup: t.setup,
      mistakes: t.mistakes,
      emotion: t.emotion,
      note: t.notes?.slice(0, 160) ?? null,
    })),
    journal: journals.slice(-7).map((j) => ({
      day: j.day,
      readiness: j.readiness,
      intention: j.intention?.slice(0, 200),
      plan: j.plan?.slice(0, 400),
      review: j.review?.slice(0, 500),
      lessons: j.lessons?.slice(0, 300),
      moodAfter: j.moodAfter,
    })),
    ringStreak: streak,
  };

  return { window: w, slides, hash, aiContext };
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
