import "server-only";
import { listTrades } from "../data/trades";
import { listJournalDays } from "../data/journal";
import { getSettings } from "../data/settings";
import { generateInsights } from "../analytics/insights";
import { propStatus } from "../analytics/prop";
import { buildReportCard } from "../analytics/reportcard";
import { evaluateRules } from "../analytics/rules";
import {
  byEmotion, byHoldTime, byHour, byMistake, bySetup, bySymbol, byTradeNumber, byWeekday, dailySeries, summarize,
  summarizeDays, type Bucket,
} from "../analytics/stats";
import { detectTilt } from "../analytics/tilt";
import { addDays, todayKey } from "../analytics/time";

const r2 = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);
const slim = (bs: Bucket[]) =>
  bs.map((b) => ({ k: b.label, n: b.trades, net: r2(b.net), wr: r2(b.winRate), exp: r2(b.expectancy) }));

/** A compact, numbers-first snapshot of the trader for the AI coach. */
export async function coachSnapshot() {
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const today = todayKey(tz);
  const since = addDays(today, -90);
  const trades = await listTrades({ since: new Date(`${since}T00:00:00Z`) });
  const journals = await listJournalDays(since, today);
  const s = summarize(trades, settings.rules.defaultRisk);
  const days = summarizeDays(dailySeries(trades, tz));
  const rules = evaluateRules(trades, settings.rules, tz);
  const tilt = detectTilt(trades, tz);
  const card = buildReportCard({ trades, rules, tilt, journals, ritual: settings.ritual, tz });
  const insights = generateInsights({ trades, rules, tilt, journals, tz });
  const last7 = trades.filter((t) => t.exitTime >= `${addDays(today, -7)}T00:00:00Z`);

  return {
    today,
    timezone: tz,
    window: "last 90 days",
    summary: {
      trades: s.trades, net: r2(s.net), winRate: r2(s.winRate), profitFactor: r2(s.profitFactor), expectancy: r2(s.expectancy),
      avgWin: r2(s.avgWin), avgLoss: r2(s.avgLoss), largestWin: r2(s.largestWin), largestLoss: r2(s.largestLoss),
      totalWon: r2(s.totalWon), totalLost: r2(s.totalLost), fees: r2(s.fees), maxDrawdown: r2(s.maxDrawdown),
      avgHoldWinMin: r2(s.avgHoldWin), avgHoldLossMin: r2(s.avgHoldLoss), avgR: s.avgR === null ? null : r2(s.avgR),
      tradingDays: days.tradingDays, greenDays: days.greenDays, redDays: days.redDays,
      bestDay: days.bestDay ? { day: days.bestDay.day, net: r2(days.bestDay.net) } : null,
      worstDay: days.worstDay ? { day: days.worstDay.day, net: r2(days.worstDay.net) } : null,
    },
    last7Days: summarize(last7).net,
    breakdowns: {
      byHourOfEntry: slim(byHour(trades, tz)),
      byWeekday: slim(byWeekday(trades, tz)),
      bySetup: slim(bySetup(trades)),
      bySymbol: slim(bySymbol(trades)),
      byTradeNumberOfDay: slim(byTradeNumber(trades, tz)),
      byHoldTime: slim(byHoldTime(trades)),
      byEmotion: slim(byEmotion(trades)),
      byMistakeTag: slim(byMistake(trades)),
    },
    rules: {
      configured: settings.rules,
      breaks: rules.byRule.map((r) => ({ rule: r.label, count: r.count, pnl: r2(r.pnl) })),
      ruleBreakingTradesPnl: r2(rules.breakPnl),
      compliantTradesPnl: r2(rules.cleanPnl),
    },
    tilt: {
      revengeTrades: tilt.flaggedIds.size,
      cost: r2(tilt.tiltCost),
      afterLoss: tilt.afterLoss,
      afterWin: tilt.afterWin,
      overtradingDays: tilt.overtradingDays.length,
      medianReentryMinAfterLoss: tilt.medianReentryAfterLoss,
    },
    reportCard: { overall: card.overall, grade: card.grade, dims: card.dimensions.map((d) => ({ d: d.label, score: d.score, why: d.why })) },
    insights: insights.slice(0, 10).map((i) => ({ kind: i.kind, title: i.title, detail: i.detail, confidence: i.confidence })),
    prop: settings.prop.enabled
      ? (() => {
          const st = propStatus(trades, settings.prop, tz);
          return {
            firm: settings.prop.firm, phase: settings.prop.phase, preset: settings.prop.preset,
            profit: r2(st.profit), cushionToMaxLoss: r2(st.cushion), targetProgress: st.targetProgress,
            consistencyBestDayShare: st.consistencyShare, dailyLossLimit: settings.prop.dailyLossLimit,
          };
        })()
      : null,
    recentJournal: journals.slice(-14).map((j) => ({
      day: j.day,
      readiness: j.readiness,
      intention: j.intention?.slice(0, 160) ?? null,
      review: j.review?.slice(0, 400) ?? null,
      lessons: j.lessons?.slice(0, 240) ?? null,
      mood: j.moodAfter,
    })),
  };
}
