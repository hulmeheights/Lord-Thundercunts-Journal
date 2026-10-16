"use client";

import { useMemo, useState } from "react";
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
import { generateInsights, type Insight } from "@/lib/analytics/insights";
import { Bars } from "@/components/m/Bars";
import { LineChart } from "@/components/m/LineChart";
import { Seg } from "@/components/m/Seg";
import { Empty, LinkBtn, Meta, Num, PageHead, Quote, Row, Rows, Section, Stat, Stats } from "@/components/m";
import { RuleLab } from "./RuleLab";

type Range = "30" | "90" | "ytd" | "all";
type Breakdown = "hour" | "weekday" | "number" | "setup" | "symbol" | "hold" | "emotion" | "mistake";

const RANGES: { value: Range; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "ytd", label: "This year" },
  { value: "all", label: "All time" },
];

const BREAKDOWNS: { value: Breakdown; label: string }[] = [
  { value: "hour", label: "Hour" },
  { value: "weekday", label: "Weekday" },
  { value: "number", label: "Trade #" },
  { value: "setup", label: "Setup" },
  { value: "symbol", label: "Market" },
  { value: "hold", label: "Hold" },
  { value: "emotion", label: "Emotion" },
  { value: "mistake", label: "Mistakes" },
];

const pf = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "∞");

function InsightRows({ items, start = 0 }: { items: Insight[]; start?: number }) {
  return (
    <Rows>
      {items.map((i, k) => (
        <Row
          key={i.id}
          i={String(start + k + 1).padStart(2, "0")}
          title={i.title.replace(/[“”]/g, '"')}
          desc={
            <>
              {i.detail}
              <span className="mt-2 block font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase">
                {i.confidence} confidence
              </span>
            </>
          }
          right={i.impact ? <Num value={i.impact} /> : undefined}
          d={k * 50}
        />
      ))}
    </Rows>
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

  // Mind ↔ market: the average day by readiness score and by whether the ritual was done.
  const mind = useMemo(() => {
    const net = new Map(m.days.map((d) => [d.day, d.net]));
    const groups: Record<string, number[]> = { "Low readiness": [], "Middling": [], "High readiness": [] };
    const ritual: Record<string, number[]> = { "Ritual skipped": [], "Ritual done": [] };
    const pre = settings.ritual.filter((r) => r.group === "pre");
    for (const j of m.js) {
      const n = net.get(j.day);
      if (n === undefined) continue;
      if (j.readiness) {
        const sc = (j.readiness.sleep + j.readiness.energy + j.readiness.focus + j.readiness.mood) / 4;
        groups[sc <= 2.5 ? "Low readiness" : sc >= 3.75 ? "High readiness" : "Middling"]!.push(n);
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

  const head = (
    <PageHead
      eyebrow="Your edge · measured"
      title={
        <>
          What the numbers <em>know</em>.
        </>
      }
      sub="Every trade you've taken, read for what it says about you: where the money comes from, where it leaks, and what one rule would have been worth."
      meta={all.length ? <Meta value={fmtMoney(m.s.net, { sign: true })} tone={m.s.net > 0 ? "pos" : m.s.net < 0 ? "neg" : null} caption={`Net · ${m.s.trades} trades`} /> : undefined}
    >
      {all.length > 0 && <Seg value={range} onChange={setRange} options={RANGES} />}
    </PageHead>
  );

  if (all.length === 0) {
    return (
      <>
        {head}
        <Empty title={<>Nothing to read <em>yet</em>.</>} action={<LinkBtn href="/settings#connections">Connect an account</LinkBtn>}>
          Connect an account or import a CSV. The patterns start to show after your first few sessions.
        </Empty>
      </>
    );
  }

  const { s, ds, card, tilt } = m;
  const strengths = m.insights.filter((i) => i.kind === "strength");
  const leaks = m.insights.filter((i) => i.kind !== "strength");
  const biggestLeak = leaks[0];

  return (
    <>
      {head}

      <Section n={1} label="The numbers" lead={s.net >= 0 ? <>The edge is <em>there</em>. Protect it.</> : <>The edge is there. The <em>leaks</em> are bigger.</>}>
        <Stats>
          <Stat value={fmtMoney(s.net, { sign: true })} tone={s.net > 0 ? "pos" : s.net < 0 ? "neg" : null} label="Net P&L" sub={`${s.trades} trades · ${ds.tradingDays} days`} />
          <Stat value={fmtPct(s.winRate)} label="Win rate" sub={`${s.wins} won · ${s.losses} lost`} d={80} />
          <Stat value={pf(s.profitFactor)} label="Profit factor" sub={`Payoff ${pf(s.payoff)}`} d={160} />
          <Stat value={fmtMoney(s.expectancy, { sign: true })} tone={s.expectancy > 0 ? "pos" : s.expectancy < 0 ? "neg" : null} label="Per trade" sub={s.avgR !== null ? `${s.avgR.toFixed(2)}R average` : "expectancy"} d={240} />
        </Stats>
        <div className="reveal mt-[clamp(3rem,8vh,5rem)]">
          <div className="mb-4 flex items-baseline justify-between font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">
            <span>Equity · by day</span>
            <span>
              Max drawdown <span className="num text-ink-2">{fmtMoney(-s.maxDrawdown)}</span>
            </span>
          </div>
          <LineChart height={240} labels={m.days.map((d) => shortDate(d.day))} series={[{ values: m.days.map((d) => d.cum) }]} />
        </div>
        <Stats className="mt-[clamp(3rem,8vh,5rem)]">
          <Stat value={fmtMoney(s.totalWon)} tone="pos" label="You made" sub={`avg win ${fmtMoney(s.avgWin)}`} />
          <Stat value={fmtMoney(-s.totalLost)} tone="neg" label="You gave back" sub={`avg loss ${fmtMoney(-s.avgLoss)}`} d={80} />
          <Stat value={ds.bestDay ? fmtMoney(ds.bestDay.net, { sign: true }) : "—"} label="Best day" sub={ds.bestDay ? shortDate(ds.bestDay.day) : "—"} d={160} />
          <Stat value={fmtMoney(s.fees)} label="Fees paid" sub={s.gross > 0 ? `${fmtPct(s.fees / s.gross)} of gross` : "—"} d={240} />
        </Stats>
      </Section>

      <Section n={2} label="Report card" aside={card.lowSample ? <span className="eyebrow">Small sample · directional</span> : undefined}>
        <div className="grid gap-x-[clamp(3rem,7vw,7rem)] gap-y-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
          <div className="reveal">
            <div className="font-serif text-[clamp(7rem,18vw,13rem)] leading-[0.85] font-light tracking-[-0.04em] italic">{card.grade}</div>
            <p className="mt-6 max-w-[30ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2">
              Weighted toward process, not profit. A good grade on a red month is still a good month.
            </p>
            <div className="mt-4 font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">
              Overall <span className="num text-ink-2">{card.overall}</span> / 100
            </div>
          </div>
          <div className="border-t border-line">
            {card.dimensions.map((d, i) => (
              <div key={d.key} className="reveal border-b border-line py-6" style={{ "--d": `${i * 60}ms` } as React.CSSProperties}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-serif text-[clamp(1.25rem,2.4vw,1.7rem)] font-light">{d.label}</span>
                  <span className="font-mono text-[12px] tracking-[0.08em]">
                    <span className="text-ink">{d.grade}</span> <span className="num text-ink-4">· {d.score}</span>
                  </span>
                </div>
                <div className="relative mt-3 h-px bg-line">
                  <i className={cn("absolute inset-y-0 left-0 block", d.score >= 70 ? "bg-pos shadow-[0_0_8px_rgba(116,184,156,0.5)]" : "bg-ink-2")} style={{ width: `${d.score}%` }} />
                </div>
                <p className="mt-4 max-w-[60ch] font-mono text-[11.5px] leading-[1.9] text-ink-3">{d.why}</p>
                <p className="mt-1 max-w-[60ch] font-mono text-[11.5px] leading-[1.9] text-ink-2">
                  <span className="text-gold">→</span> {d.tip}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {m.insights.length > 0 && (
        <>
          <Section n={3} label="What's leaking" lead={biggestLeak ? <>Ranked by what they <em>cost</em>.</> : undefined}>
            {leaks.length ? <InsightRows items={leaks.slice(0, 6)} /> : <Empty title={<>Nothing leaking in this range. <em>Rare.</em></>} />}
          </Section>
          <Section n={4} label="What's working" lead={<>Do more of <em>this</em>.</>}>
            {strengths.length ? <InsightRows items={strengths.slice(0, 5)} /> : <Empty title={<>No clear strength yet. <em>Give it time.</em></>} />}
          </Section>
        </>
      )}

      <Section n={5} label="Rule Lab" lead={<>Replay your trades under <em>different</em> rules.</>}>
        <RuleLab trades={trades} tz={tz} />
      </Section>

      <Section n={6} label="Tilt radar" lead={tilt.tiltCost < 0 ? <>The trades after the <em>loss</em>.</> : <>No tilt worth <em>naming</em>.</>}>
        <Stats>
          <Stat value={fmtMoney(tilt.tiltCost, { sign: true })} tone={tilt.tiltCost < 0 ? "neg" : tilt.tiltCost > 0 ? "pos" : null} label="Cost of tilt" sub={`${tilt.flaggedIds.size} revenge-style trades`} />
          <Stat value={fmtMoney(tilt.afterLoss.expectancy, { sign: true })} tone={tilt.afterLoss.expectancy < 0 ? "neg" : "pos"} label="Per trade after a loss" sub={`${fmtPct(tilt.afterLoss.winRate)} won`} d={80} />
          <Stat value={fmtMoney(tilt.afterWin.expectancy, { sign: true })} tone={tilt.afterWin.expectancy < 0 ? "neg" : "pos"} label="Per trade after a win" sub={`${fmtPct(tilt.afterWin.winRate)} won`} d={160} />
          <Stat value={tilt.medianReentryAfterLoss === null ? "—" : fmtHold(tilt.medianReentryAfterLoss)} label="Back in after a loss" sub={`${tilt.overtradingDays.length} overtrading days`} d={240} />
        </Stats>
        {m.rules.byRule.length > 0 && (
          <div className="mt-[clamp(3rem,8vh,5rem)]">
            <div className="reveal mb-4 font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">Rule breaks · what each one cost</div>
            <Bars data={m.rules.byRule.map((r) => ({ label: r.label, value: r.pnl, sub: `×${r.count}` }))} />
          </div>
        )}
      </Section>

      <Section n={7} label="Where the money comes from" aside={<Seg value={bd} onChange={setBd} options={BREAKDOWNS} className="max-w-full" />}>
        {buckets.length === 0 ? (
          <Empty title={<>Tag a few trades to <em>see</em> this.</>}>Add {bd === "setup" ? "setups" : bd === "emotion" ? "emotions" : "mistakes"} on the trade page and this view fills in.</Empty>
        ) : (
          <>
            <Bars data={buckets.slice(0, 14).map((b) => ({ label: b.label, value: b.net, sub: `${b.trades} · ${fmtPct(b.winRate)}` }))} />
            <div className="reveal mt-10 overflow-x-auto">
              <table className="w-full min-w-[520px] font-mono text-[11.5px]">
                <thead>
                  <tr className="text-left text-[9px] tracking-[0.28em] text-ink-4 uppercase">
                    <th className="pb-3 font-normal">Bucket</th>
                    <th className="pb-3 text-right font-normal">Trades</th>
                    <th className="pb-3 text-right font-normal">Won</th>
                    <th className="pb-3 text-right font-normal">Per trade</th>
                    <th className="pb-3 text-right font-normal">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.slice(0, 12).map((b) => (
                    <tr key={b.key} className="border-t border-line">
                      <td className="max-w-[200px] truncate py-3 text-ink-2">{b.label}</td>
                      <td className="num py-3 text-right text-ink-3">{b.trades}</td>
                      <td className="num py-3 text-right text-ink-3">{fmtPct(b.winRate)}</td>
                      <td className="py-3 text-right">
                        <Num value={b.expectancy} />
                      </td>
                      <td className="py-3 text-right">
                        <Num value={b.net} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      <Section n={8} label="Mind · market" lead={<>How your <em>state</em> moves your P&amp;L.</>}>
        {mind.samples < 4 ? (
          <Empty title={<>Check in each <em>morning</em>.</>}>
            Two weeks of readiness check-ins and this shows exactly what sleep, energy and focus are worth to you.
          </Empty>
        ) : (
          <div className="grid gap-x-[clamp(3rem,6vw,6rem)] gap-y-12 lg:grid-cols-2">
            <div>
              <div className="reveal mb-4 font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">Average day by readiness</div>
              <Bars data={mind.readiness} />
            </div>
            <div>
              <div className="reveal mb-4 font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">Average day by ritual</div>
              <Bars data={mind.ritual} />
            </div>
          </div>
        )}
      </Section>

      <div className="py-[clamp(4rem,12vh,9rem)]">
        <Quote cite="the edge">
          The edge is everything you <em className="not-italic">don&apos;t</em> do.
        </Quote>
      </div>
    </>
  );
}
