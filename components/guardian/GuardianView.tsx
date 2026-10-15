"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { PropSettings, Trade } from "@/lib/types";
import { propStatus, simulateProp } from "@/lib/analytics/prop";
import { fmtMoney, fmtPct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, CardHeader } from "@/components/ui/Card";
import { Gauge } from "@/components/charts/Gauge";
import { FanChart } from "@/components/charts/FanChart";
import { ProgressRing } from "@/components/ui/Rings";

export function GuardianView({ trades, prop, tz, brokerBalance }: { trades: Trade[]; prop: PropSettings; tz: string; brokerBalance: number | null }) {
  const st = useMemo(() => propStatus(trades, prop, tz), [trades, prop, tz]);
  const mc = useMemo(() => simulateProp(st, prop, { sims: 4000, horizon: 30 }), [st, prop]);
  const worstDay = Math.min(0, ...st.dailyPnls);
  const survivable = worstDay < 0 ? Math.floor(st.cushion / -worstDay) : null;
  const danger = st.breached || st.cushionPct < 0.25;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <Gauge value={st.cushionPct} size={230} stroke={16}>
              <div className="text-center">
                <div className="num text-[34px] font-bold tracking-[-0.03em]">{fmtMoney(st.cushion)}</div>
                <div className="text-[12.5px] text-ink-3">above max loss</div>
              </div>
            </Gauge>
            <div className="w-full flex-1 space-y-3">
              <div className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold", danger ? "bg-neg/15 text-neg" : "bg-pos/15 text-pos")}>
                {danger ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />}
                {st.breached ? "Max loss breached" : danger ? "Cushion is thin — size down" : "Account protected"}
              </div>
              {[
                ["Balance", fmtMoney(st.balance)],
                ["Profit", fmtMoney(st.profit, { sign: true })],
                ["Max-loss floor", fmtMoney(st.floor)],
                ["High-water (EOD)", fmtMoney(st.highWater)],
                ...(brokerBalance !== null ? [["Broker-reported balance", fmtMoney(brokerBalance)]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-line pb-2 text-[14px] last:border-0">
                  <span className="text-ink-3">{k}</span>
                  <span className="num font-semibold">{v}</span>
                </div>
              ))}
              {survivable !== null && (
                <p className="text-[13px] text-ink-3">
                  You can absorb <span className="font-semibold text-ink">{survivable}</span> more days like your worst ({fmtMoney(worstDay)}).
                </p>
              )}
            </div>
          </div>
        </Card>

        <div className="grid gap-5 lg:col-span-5">
          <Card>
            <CardHeader eyebrow="Today" title="Daily loss limit" />
            {prop.dailyLossLimit ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className={cn("num text-[26px] font-bold", st.todayPnl >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(st.todayPnl, { sign: true })}</span>
                  <span className="text-[13px] text-ink-3">limit {fmtMoney(-prop.dailyLossLimit)}</span>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-fill-2">
                  <motion.div
                    className={cn("h-full rounded-full", (st.dailyLossUsed ?? 0) > 0.7 ? "bg-neg" : (st.dailyLossUsed ?? 0) > 0.4 ? "bg-orange" : "bg-pos")}
                    initial={{ width: 0 }}
                    animate={{ width: `${(st.dailyLossUsed ?? 0) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-[12.5px] text-ink-3">{fmtPct(st.dailyLossUsed ?? 0)} of today&apos;s loss limit used.</p>
              </>
            ) : (
              <p className="text-[13.5px] text-ink-3">No daily loss limit on this account.</p>
            )}
          </Card>
          {prop.profitTarget !== null && (
            <Card>
              <div className="flex items-center gap-5">
                <ProgressRing value={st.targetProgress ?? 0} size={92} stroke={10} color="#30d158">
                  <span className="num text-[16px] font-bold">{fmtPct(st.targetProgress ?? 0)}</span>
                </ProgressRing>
                <div className="min-w-0">
                  <div className="eyebrow mb-1">Profit target</div>
                  <div className="text-[15px] font-semibold">
                    {fmtMoney(Math.max(0, (st.requiredProfit ?? 0) - st.profit))} to go
                  </div>
                  <div className="mt-1 text-[12.5px] text-ink-3">
                    {st.requiredProfit !== null && st.requiredProfit > (prop.profitTarget ?? 0)
                      ? `Consistency raised your target to ${fmtMoney(st.requiredProfit)}.`
                      : st.daysToTarget !== null
                        ? st.daysToTarget === 0
                          ? "Target reached."
                          : `~${st.daysToTarget} trading days at your average pace.`
                        : "Your average day is negative — focus on process first."}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader eyebrow="Monte Carlo · 4,000 futures from your own days" title="Where this account is heading" />
          {mc ? (
            <>
              <div className="mb-4 grid grid-cols-3 gap-3">
                {prop.profitTarget !== null && (
                  <div>
                    <div className="text-[12px] text-ink-3">Pass in 30 days</div>
                    <div className="num text-[26px] font-bold text-pos">{fmtPct(mc.passProb)}</div>
                  </div>
                )}
                <div>
                  <div className="text-[12px] text-ink-3">Blow the account</div>
                  <div className={cn("num text-[26px] font-bold", mc.bustProb > 0.25 ? "text-neg" : "text-ink")}>{fmtPct(mc.bustProb)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-3">{prop.profitTarget !== null ? "Median days to pass" : "Still running"}</div>
                  <div className="num text-[26px] font-bold">{prop.profitTarget !== null ? (mc.medianDaysToPass ?? "—") : fmtPct(mc.openProb)}</div>
                </div>
              </div>
              <FanChart bands={mc.bands} target={prop.profitTarget !== null ? prop.startBalance + (st.requiredProfit ?? prop.profitTarget) : null} floor={st.floor} />
              <p className="mt-3 text-[12px] leading-relaxed text-ink-4">
                Resamples your last {Math.min(60, st.dailyPnls.length)} trading days with the trailing max loss, daily limit and consistency rule applied. The
                band shows the 10th–90th percentile of outcomes.
              </p>
            </>
          ) : (
            <p className="text-[14px] text-ink-3">Needs at least 5 trading days on this account to simulate.</p>
          )}
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader eyebrow="Consistency rule" title="Best-day share" />
          {prop.consistencyPct ? (
            <>
              <div className="num text-[34px] font-bold">{st.consistencyShare === null ? "—" : fmtPct(st.consistencyShare)}</div>
              <div className="mt-1 text-[13px] text-ink-3">limit {prop.consistencyPct}% · best day {fmtMoney(st.bestDay, { sign: true })}</div>
              <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-fill-2">
                <div className="absolute inset-y-0 w-px bg-ink-3" style={{ left: `${prop.consistencyPct}%` }} />
                <motion.div
                  className={cn("h-full rounded-full", st.consistencyOk === false ? "bg-orange" : "bg-pos")}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (st.consistencyShare ?? 0) * 100)}%` }}
                />
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
                {st.consistencyOk === false ? "One day is carrying the account. Keep stacking normal days — don't force a big one." : "Your profits are spread out nicely."}
              </p>
            </>
          ) : (
            <p className="text-[13.5px] text-ink-3">No consistency rule set.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
