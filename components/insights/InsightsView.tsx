"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Flame, Gauge as GaugeIcon, Radar, TriangleAlert, Trophy } from "lucide-react";
import type { JournalDay, Settings, Trade } from "@/lib/types";
import { cn } from "@/lib/cn";
import { fmtHold, shortDate, todayKey, addDays, dayKey } from "@/lib/analytics/time";
import { fmtMoney, fmtPct } from "@/lib/format";
import {
  byEmotion, byHoldTime, byHour, byMistake, bySetup, bySymbol, byTradeNumber, byWeekday, dailySeries, summarize, summarizeDays,
  type Bucket,
} from "@/lib/analytics/stats";
import { evaluateRules } from "@/lib/analytics/rules";
import { detectTilt } from "@/lib/analytics/tilt";
import { buildReportCard } from "@/lib/analytics/reportcard";
import { generateInsights } from "@/lib/analytics/insights";
import { Card, CardHeader } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { AreaChart } from "@/components/charts/AreaChart";
import { BarChart } from "@/components/charts/BarChart";
import { Empty } from "@/components/ui/Empty";
import { RuleLab } from "./RuleLab";

type Range = "30" | "90" | "ytd" | "all";
type Breakdown = "hour" | "weekday" | "number" | "setup" | "symbol" | "hold" | "emotion" | "mistake";

const BREAKDOWNS: { value: Breakdown; label: string }[] = [
  { value: "hour", label: "Time" },
  { value: "weekday", label: "Weekday" },
  { value: "number", label: "Trade #" },
  { value: "setup", label: "Setup" },
  { value: "symbol", label: "Market" },
  { value: "hold", label: "Hold" },
  { value: "emotion", label: "Emotion" },
  { value: "mistake", label: "Mistakes" },
];

function Kpi({ label, value, tone, sub }: { label: string; value: string; tone?: "pos" | "neg"; sub?: string }) {
  return (
    <div className="glass rounded-[3px] p-4">
      <div className="text-[12px] font-medium text-ink-3">{label}</div>
      <div className={cn("num mt-1 truncate text-[22px] font-bold tracking-[-0.02em]", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11.5px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function InsightsView({ trades: all, journals, settings }: { trades: Trade[]; journals: JournalDay[]; settings: Settings }) {
  const tz = settings.profile.timezone;
  const [range, setRange] = useState<Range>("90");
  const [bd, setBd] = useState<Breakdown>("hour");

  const trades = useMemo(() => {
    const today = todayKey(tz);
    const from = range === "all" ? "0000" : range === "ytd" ? `${today.slice(0, 4)}-01-01` : addDays(today, -Number(range));
    return all.filter((t) => dayKey(t.exitTime, tz) >= from);
  }, [all, range, tz]);

  const m = useMemo(() => {
    const s = summarize(trades, settings.rules.defaultRisk);
    const days = dailySeries(trades, tz);
    const ds = summarizeDays(days);
    const rules = evaluateRules(trades, settings.rules, tz);
    const tilt = detectTilt(trades, tz);
    const first = days[0]?.day ?? "0000";
    const js = journals.filter((j) => j.day >= first);
    const card = buildReportCard({ trades, rules, tilt, journals: js, ritual: settings.ritual, tz });
    const insights = generateInsights({ trades, rules, tilt, journals: js, tz });
    return { s, days, ds, rules, tilt, card, insights, js };
  }, [trades, journals, settings, tz]);

  const buckets: Bucket[] = useMemo(() => {
    switch (bd) {
      case "hour": return byHour(trades, tz);
      case "weekday": return byWeekday(trades, tz);
      case "number": return byTradeNumber(trades, tz);
      case "setup": return bySetup(trades);
      case "symbol": return bySymbol(trades);
      case "hold": return byHoldTime(trades);
      case "emotion": return byEmotion(trades);
      case "mistake": return byMistake(trades);
    }
  }, [bd, trades, tz]);

  // Mind ↔ market: average day by readiness score.
  const mind = useMemo(() => {
    const net = new Map(m.days.map((d) => [d.day, d.net]));
    const groups: Record<string, number[]> = { "Low (≤2.5)": [], "Mid": [], "High (≥3.75)": [] };
    const ritual: Record<string, number[]> = { "Ritual skipped": [], "Ritual done": [] };
    const pre = settings.ritual.filter((r) => r.group === "pre");
    for (const j of m.js) {
      const n = net.get(j.day);
      if (n === undefined) continue;
      if (j.readiness) {
        const sc = (j.readiness.sleep + j.readiness.energy + j.readiness.focus + j.readiness.mood) / 4;
        groups[sc <= 2.5 ? "Low (≤2.5)" : sc >= 3.75 ? "High (≥3.75)" : "Mid"]!.push(n);
      }
      if (pre.length) {
        const done = pre.filter((r) => j.checklist[r.id]).length / pre.length;
        ritual[done >= 0.8 ? "Ritual done" : "Ritual skipped"]!.push(n);
      }
    }
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
      readiness: Object.entries(groups).map(([label, xs]) => ({ label, value: avg(xs), sub: `${xs.length} days` })),
      ritual: Object.entries(ritual).map(([label, xs]) => ({ label, value: avg(xs), sub: `${xs.length} days` })),
      samples: Object.values(groups).reduce((a, x) => a + x.length, 0),
    };
  }, [m.days, m.js, settings.ritual]);

  if (all.length === 0) {
    return (
      <Card>
        <Empty icon={<Radar size={22} />} title="Nothing to analyse yet">
          Connect a broker or load sample data from Settings — insights appear after your first few trades.
        </Empty>
      </Card>
    );
  }

  const { s, ds } = m;
  return (
    <div className="space-y-6">
      <Segmented value={range} onChange={setRange} options={[{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "ytd", label: "YTD" }, { value: "all", label: "All time" }]} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Net P&L" value={fmtMoney(s.net, { sign: true })} tone={s.net >= 0 ? "pos" : "neg"} sub={`${s.trades} trades · ${ds.tradingDays} days`} />
        <Kpi label="Win rate" value={fmtPct(s.winRate)} sub={`${s.wins}W · ${s.losses}L`} />
        <Kpi label="Profit factor" value={Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"} tone={s.profitFactor >= 1 ? "pos" : "neg"} sub={`Payoff ${Number.isFinite(s.payoff) ? s.payoff.toFixed(2) : "∞"}`} />
        <Kpi label="Expectancy" value={fmtMoney(s.expectancy, { sign: true })} tone={s.expectancy >= 0 ? "pos" : "neg"} sub={s.avgR !== null ? `${s.avgR.toFixed(2)}R avg` : "per trade"} />
        <Kpi label="You made" value={fmtMoney(s.totalWon)} tone="pos" sub={`avg win ${fmtMoney(s.avgWin)}`} />
        <Kpi label="You lost" value={fmtMoney(-s.totalLost)} tone="neg" sub={`avg loss ${fmtMoney(-s.avgLoss)}`} />
        <Kpi label="Max drawdown" value={fmtMoney(-s.maxDrawdown)} sub={`best day ${fmtMoney(ds.bestDay?.net ?? 0, { sign: true })}`} />
        <Kpi label="Fees paid" value={fmtMoney(s.fees)} sub={s.gross > 0 ? `${fmtPct(s.fees / s.gross)} of gross` : undefined} />
      </div>

      <Card>
        <CardHeader eyebrow="Equity curve" title={<span className={s.net >= 0 ? "text-pos" : "text-neg"}>{fmtMoney(s.net, { sign: true })}</span>} />
        <AreaChart height={260} labels={m.days.map((d) => shortDate(d.day))} series={[{ values: m.days.map((d) => d.cum) }]} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <div className="eyebrow mb-1">Report card</div>
              <h2 className="title-lg">What you&apos;re judged on</h2>
              <p className="mt-1 text-[12.5px] text-ink-3">Process-weighted. {m.card.lowSample && "Small sample — directional only."}</p>
            </div>
            <div className="text-brand font-[family-name:var(--font-display)] text-[56px] leading-none font-black tracking-[-0.04em]">{m.card.grade}</div>
          </div>
          <div className="space-y-4">
            {m.card.dimensions.map((d, i) => (
              <div key={d.key}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[14px] font-semibold">{d.label}</span>
                  <span className="num text-[13px] font-semibold">
                    {d.grade} <span className="text-ink-4">· {d.score}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fill-2">
                  <motion.div className="bg-brand h-full rounded-full" initial={{ width: 0 }} whileInView={{ width: `${d.score}%` }} viewport={{ once: true }} transition={{ delay: i * 0.08, type: "spring", stiffness: 60, damping: 16 }} />
                </div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">{d.why}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-cyan/90">→ {d.tip}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader eyebrow="What's going well · what's leaking" title="Insights" />
          {m.insights.length === 0 ? (
            <p className="text-[14px] text-ink-3">Not enough trades in this range for reliable patterns yet.</p>
          ) : (
            <div className="space-y-2.5">
              {m.insights.slice(0, 9).map((i) => (
                <div key={i.id} className="flex gap-3 rounded-[3px] border border-line bg-fill p-4">
                  <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[3px]", i.kind === "strength" ? "bg-pos/15 text-pos" : i.kind === "leak" ? "bg-orange/15 text-orange" : "bg-cyan/15 text-cyan")}>
                    {i.kind === "strength" ? <Trophy size={17} /> : i.kind === "leak" ? <TriangleAlert size={17} /> : <GaugeIcon size={17} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[14.5px] leading-snug font-semibold">{i.title}</div>
                      <span className="shrink-0 rounded-full bg-fill-2 px-2 py-0.5 text-[10.5px] font-semibold text-ink-3 capitalize">{i.confidence}</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{i.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader eyebrow="What-if engine" title="Rule Lab · your ghost curve" />
        <RuleLab trades={trades} tz={tz} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader eyebrow="Tilt Radar" title="Emotional trading, detected" />
          <div className="mb-5 flex items-center gap-4">
            <div className={cn("grid h-14 w-14 place-items-center rounded-[3px]", m.tilt.tiltCost < 0 ? "bg-neg/15 text-neg" : "bg-pos/15 text-pos")}>
              <Flame size={24} />
            </div>
            <div>
              <div className={cn("num text-[26px] font-bold", m.tilt.tiltCost < 0 ? "text-neg" : "text-pos")}>{fmtMoney(m.tilt.tiltCost, { sign: true })}</div>
              <div className="text-[13px] text-ink-3">from {m.tilt.flaggedIds.size} revenge-style trades</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div className="rounded-[3px] bg-fill p-3.5">
              <div className="text-ink-3">After a loss</div>
              <div className={cn("num text-[17px] font-semibold", m.tilt.afterLoss.expectancy >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(m.tilt.afterLoss.expectancy, { sign: true })}<span className="text-[12px] font-normal text-ink-3">/trade</span></div>
              <div className="text-ink-3">{fmtPct(m.tilt.afterLoss.winRate)} win rate</div>
            </div>
            <div className="rounded-[3px] bg-fill p-3.5">
              <div className="text-ink-3">After a win</div>
              <div className={cn("num text-[17px] font-semibold", m.tilt.afterWin.expectancy >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(m.tilt.afterWin.expectancy, { sign: true })}<span className="text-[12px] font-normal text-ink-3">/trade</span></div>
              <div className="text-ink-3">{fmtPct(m.tilt.afterWin.winRate)} win rate</div>
            </div>
            <div className="rounded-[3px] bg-fill p-3.5">
              <div className="text-ink-3">Median re-entry after loss</div>
              <div className="num text-[17px] font-semibold">{m.tilt.medianReentryAfterLoss === null ? "—" : fmtHold(m.tilt.medianReentryAfterLoss)}</div>
            </div>
            <div className="rounded-[3px] bg-fill p-3.5">
              <div className="text-ink-3">Overtrading days</div>
              <div className="num text-[17px] font-semibold">{m.tilt.overtradingDays.length}</div>
            </div>
          </div>
          {m.rules.byRule.length > 0 && (
            <div className="mt-5">
              <div className="eyebrow mb-2">Rule breaks ledger</div>
              <div className="divide-y divide-line rounded-[3px] border border-line">
                {m.rules.byRule.map((r) => (
                  <div key={r.rule} className="flex items-center justify-between px-4 py-2.5 text-[13.5px]">
                    <span>
                      {r.label} <span className="text-ink-4">×{r.count}</span>
                    </span>
                    <span className={cn("num font-semibold", r.pnl >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(r.pnl, { sign: true })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="eyebrow mb-1">Breakdowns</div>
              <h2 className="title-lg">Where the money comes from</h2>
            </div>
          </div>
          <div className="-mx-1 mb-4 overflow-x-auto px-1">
            <Segmented size="sm" value={bd} onChange={setBd} options={BREAKDOWNS} />
          </div>
          {buckets.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">Tag trades with {bd === "setup" ? "setups" : bd === "emotion" ? "emotions" : "mistakes"} to unlock this view.</p>
          ) : (
            <>
              <BarChart data={buckets.slice(0, 16).map((b) => ({ label: b.label.length > 8 ? `${b.label.slice(0, 7)}…` : b.label, value: b.net, sub: `${b.trades} trades · ${fmtPct(b.winRate)}` }))} height={190} />
              <div className="mt-4 overflow-hidden rounded-[3px] border border-line">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-fill text-left text-[11.5px] text-ink-3">
                      <th className="px-3.5 py-2 font-semibold">Bucket</th>
                      <th className="px-2 py-2 text-right font-semibold">Trades</th>
                      <th className="px-2 py-2 text-right font-semibold">Win%</th>
                      <th className="px-2 py-2 text-right font-semibold">Per trade</th>
                      <th className="px-3.5 py-2 text-right font-semibold">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {buckets.slice(0, 12).map((b) => (
                      <tr key={b.key}>
                        <td className="max-w-[140px] truncate px-3.5 py-2 font-medium">{b.label}</td>
                        <td className="num px-2 py-2 text-right text-ink-2">{b.trades}</td>
                        <td className="num px-2 py-2 text-right text-ink-2">{fmtPct(b.winRate)}</td>
                        <td className={cn("num px-2 py-2 text-right", b.expectancy >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(b.expectancy, { sign: true })}</td>
                        <td className={cn("num px-3.5 py-2 text-right font-semibold", b.net >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(b.net, { sign: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader eyebrow="Mind ↔ market" title="How your state moves your P&L" />
        {mind.samples < 4 ? (
          <p className="text-[14px] text-ink-3">Log your readiness check-in each morning — after a couple of weeks this shows exactly how sleep, energy and focus change your results.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="mb-2 text-[13px] font-semibold text-ink-2">Average day by readiness</div>
              <BarChart data={mind.readiness} height={170} />
            </div>
            <div>
              <div className="mb-2 text-[13px] font-semibold text-ink-2">Average day by pre-market ritual</div>
              <BarChart data={mind.ritual} height={170} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
