"use client";

import { useMemo, useState } from "react";
import { FlaskConical, Minus, Plus, Sparkles } from "lucide-react";
import type { Trade } from "@/lib/types";
import { runWhatIf, suggestRules, type WhatIfOptions } from "@/lib/analytics/whatif";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { shortDate, WEEKDAYS } from "@/lib/analytics/time";
import { AreaChart } from "@/components/charts/AreaChart";
import { Toggle } from "@/components/ui/Toggle";
import { Chip } from "@/components/ui/Chip";
import { Segmented } from "@/components/ui/Segmented";

function Stepper({ label, value, onChange, step = 1, min = 0, max = 50, format }: { label: string; value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; max?: number; format?: (n: number) => string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[13.5px] text-ink-2">{label}</span>
      <div className="flex items-center gap-1.5">
        <button className="grid h-8 w-8 place-items-center rounded-full bg-fill-2 text-ink-2 hover:text-ink" onClick={() => onChange(value === null ? null : value - step < min + step ? null : value - step)} aria-label="Less">
          <Minus size={14} />
        </button>
        <span className={cn("num w-20 text-center text-[13.5px] font-semibold", value === null && "text-ink-4")}>{value === null ? "off" : format ? format(value) : value}</span>
        <button className="grid h-8 w-8 place-items-center rounded-full bg-fill-2 text-ink-2 hover:text-ink" onClick={() => onChange(Math.min(max, (value ?? min) + step))} aria-label="More">
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

const CUTOFFS = [null, 600, 630, 660, 690, 720, 780, 840] as const;

/**
 * Rule Lab: replay your real trades under different rules and watch the
 * ghost curve show what discipline would have been worth.
 */
export function RuleLab({ trades, tz }: { trades: Trade[]; tz: string }) {
  const [o, setO] = useState<WhatIfOptions>({});
  const set = (patch: WhatIfOptions) => setO((cur) => ({ ...cur, ...patch }));
  const result = useMemo(() => runWhatIf(trades, o, tz), [trades, o, tz]);
  const suggestions = useMemo(() => suggestRules(trades, tz), [trades, tz]);
  const active = Object.values(o).some((v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== false && v !== "both"));
  const cutoffIdx = CUTOFFS.findIndex((c) => c === (o.windowEnd ?? null));

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div>
            <div className="text-[12px] text-ink-3">Actual</div>
            <div className={cn("num text-[22px] font-bold", result.actual.net >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(result.actual.net, { sign: true })}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-3">With these rules</div>
            <div className={cn("num text-[22px] font-bold", result.ghost.net >= 0 ? "text-cyan" : "text-neg")}>{fmtMoney(result.ghost.net, { sign: true })}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-3">Difference</div>
            <div className={cn("num text-[22px] font-bold", result.delta > 0 ? "text-pos" : result.delta < 0 ? "text-neg" : "text-ink-2")}>{fmtMoney(result.delta, { sign: true })}</div>
          </div>
        </div>
        <AreaChart
          height={240}
          labels={result.actualCurve.map((d) => shortDate(d.day))}
          series={[
            { values: result.actualCurve.map((d) => d.cum), label: "Actual", color: "rgba(235,235,245,0.55)", fill: false },
            ...(active ? [{ values: result.ghostCurve.map((d) => d.cum), label: "Ghost", color: "#64d2ff", dashed: true }] : []),
          ]}
        />
        <div className="mt-3 text-[12.5px] text-ink-3">
          {active ? (
            <>
              {result.removedCount} of {result.actual.trades} trades skipped · ghost win rate {(result.ghost.winRate * 100).toFixed(0)}% vs {(result.actual.winRate * 100).toFixed(0)}%
            </>
          ) : (
            "Flip a rule on the right to see your ghost curve."
          )}
        </div>
        {suggestions.length > 0 && (
          <div className="mt-6">
            <div className="eyebrow mb-2 flex items-center gap-1.5 text-cyan">
              <Sparkles size={12} /> Rules that would have paid you
            </div>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <button key={s.label} onClick={() => setO(s.opts)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-fill px-4 py-3 text-left transition-colors hover:bg-fill-2">
                  <span className="text-[14px] font-medium">{s.label}</span>
                  <span className="num shrink-0 text-[13.5px] font-semibold text-pos">{fmtMoney(s.delta, { sign: true })}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="lg:col-span-5">
        <div className="rounded-[22px] border border-line bg-fill px-4 py-2">
          <div className="flex items-center gap-2 border-b border-line py-2.5 text-[13px] font-semibold text-ink-2">
            <FlaskConical size={15} className="text-purple" /> Test a rule set
            {active && (
              <button onClick={() => setO({})} className="ml-auto text-[12px] font-semibold text-cyan">
                Reset
              </button>
            )}
          </div>
          <div className="divide-y divide-line">
            <Stepper label="Max trades a day" value={o.maxTradesPerDay ?? null} onChange={(v) => set({ maxTradesPerDay: v })} min={0} max={20} />
            <Stepper label="Stop after losses in a row" value={o.stopAfterLosses ?? null} onChange={(v) => set({ stopAfterLosses: v })} min={0} max={10} />
            <Stepper label="Daily loss limit" value={o.maxDailyLoss ?? null} onChange={(v) => set({ maxDailyLoss: v })} step={100} min={0} max={10000} format={(n) => fmtMoney(n)} />
            <Stepper label="Walk away when up" value={o.dailyProfitStop ?? null} onChange={(v) => set({ dailyProfitStop: v })} step={100} min={0} max={20000} format={(n) => fmtMoney(n)} />
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-[13.5px] text-ink-2">Stop trading at</span>
              <select
                className="field h-9 w-28 py-0 text-[13px]"
                value={cutoffIdx < 0 ? 0 : cutoffIdx}
                onChange={(e) => {
                  const c = CUTOFFS[Number(e.target.value)];
                  set(c ? { windowStart: 0, windowEnd: c } : { windowStart: null, windowEnd: null });
                }}
              >
                {CUTOFFS.map((c, i) => (
                  <option key={i} value={i}>
                    {c === null ? "off" : `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="py-2.5">
              <div className="mb-2 text-[13.5px] text-ink-2">Skip these days</div>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.slice(0, 5).map((w, i) => (
                  <Chip
                    key={w}
                    active={o.excludeWeekdays?.includes(i)}
                    onClick={() => {
                      const cur = o.excludeWeekdays ?? [];
                      set({ excludeWeekdays: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] });
                    }}
                  >
                    {w}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-[13.5px] text-ink-2">Skip trades tagged with mistakes</span>
              <Toggle checked={!!o.skipMistakeTagged} onChange={(v) => set({ skipMistakeTagged: v })} />
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-[13.5px] text-ink-2">Sit out revenge trades</span>
              <Toggle checked={!!o.skipTilt} onChange={(v) => set({ skipTilt: v })} />
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-[13.5px] text-ink-2">Direction</span>
              <Segmented size="sm" value={o.direction ?? "both"} onChange={(v) => set({ direction: v })} options={[{ value: "both", label: "Both" }, { value: "long", label: "Long" }, { value: "short", label: "Short" }]} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
