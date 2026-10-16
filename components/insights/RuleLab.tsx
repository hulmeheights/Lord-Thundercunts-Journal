"use client";

import { useMemo, useState } from "react";
import type { Trade } from "@/lib/types";
import { runWhatIf, suggestRules, type WhatIfOptions } from "@/lib/analytics/whatif";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { shortDate, WEEKDAYS } from "@/lib/analytics/time";
import { LineChart } from "@/components/m/LineChart";
import { Seg } from "@/components/m/Seg";
import { Toggle } from "@/components/ui/Toggle";
import { Num } from "@/components/m";

const rowCls = "flex items-center justify-between gap-4 border-b border-line py-3.5";
const nameCls = "font-mono text-[11px] tracking-[0.06em] text-ink-2";

function Stepper({ label, value, onChange, step = 1, min = 0, max = 50, format }: { label: string; value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; max?: number; format?: (n: number) => string }) {
  const btn = "grid h-7 w-7 place-items-center border border-line font-mono text-[12px] text-ink-3 transition-colors duration-300 hover:border-ink hover:text-ink";
  return (
    <div className={rowCls}>
      <span className={nameCls}>{label}</span>
      <div className="flex items-center gap-2">
        <button className={btn} onClick={() => onChange(value === null ? null : value - step < min + step ? null : value - step)} aria-label={`Less: ${label}`}>
          −
        </button>
        <span className={cn("num w-[4.5rem] text-center font-mono text-[11.5px]", value === null ? "text-ink-4" : "text-ink")}>{value === null ? "off" : format ? format(value) : value}</span>
        <button className={btn} onClick={() => onChange(Math.min(max, (value ?? min) + step))} aria-label={`More: ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

const CUTOFFS = [null, 600, 630, 660, 690, 720, 780, 840] as const;
const hhmm = (c: number) => `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;

/**
 * Rule Lab: replay your real trades under different rules and watch the
 * ghost curve (dashed gold) show what discipline would have been worth.
 */
export function RuleLab({ trades, tz }: { trades: Trade[]; tz: string }) {
  const [o, setO] = useState<WhatIfOptions>({});
  const set = (patch: WhatIfOptions) => setO((cur) => ({ ...cur, ...patch }));
  const result = useMemo(() => runWhatIf(trades, o, tz), [trades, o, tz]);
  const suggestions = useMemo(() => suggestRules(trades, tz), [trades, tz]);
  const active = Object.values(o).some((v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== false && v !== "both"));
  const cutoffIdx = CUTOFFS.findIndex((c) => c === (o.windowEnd ?? null));

  return (
    <div className="grid gap-x-[clamp(3rem,6vw,6rem)] gap-y-14 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="reveal grid grid-cols-3 gap-6 border-t border-line pt-6">
          {[
            { k: "As traded", v: result.actual.net },
            { k: "With these rules", v: result.ghost.net },
            { k: "Difference", v: result.delta },
          ].map((x) => (
            <div key={x.k}>
              <div className="font-mono text-[clamp(1.2rem,2.6vw,2rem)] font-light">
                <Num value={x.v} />
              </div>
              <div className="mt-2 font-mono text-[9px] tracking-[0.28em] text-ink-4 uppercase">{x.k}</div>
            </div>
          ))}
        </div>
        <div className="reveal mt-10">
          <LineChart
            height={240}
            labels={result.actualCurve.map((d) => shortDate(d.day))}
            series={[
              { values: result.actualCurve.map((d) => d.cum), tone: "ink", label: "As traded" },
              ...(active ? [{ values: result.ghostCurve.map((d) => d.cum), tone: "gold" as const, dashed: true, label: "Ghost" }] : []),
            ]}
          />
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[9.5px] tracking-[0.26em] text-ink-4 uppercase">
            <span>
              <i className="mr-2 inline-block h-px w-5 bg-ink align-middle" />
              As traded
            </span>
            <span>
              <i className="mr-2 inline-block w-5 border-t border-dashed border-gold align-middle" />
              Ghost
            </span>
            <span className="normal-case tracking-[0.04em]">
              {active
                ? `${result.removedCount} of ${result.actual.trades} trades skipped · ghost wins ${(result.ghost.winRate * 100).toFixed(0)}% vs ${(result.actual.winRate * 100).toFixed(0)}%`
                : "Set a rule to draw the ghost."}
            </span>
          </div>
        </div>

        {suggestions.length > 0 && (
          <div className="mt-[clamp(3rem,7vh,4.5rem)]">
            <div className="label reveal mb-5">Rules that would have paid you</div>
            <div className="border-t border-line">
              {suggestions.map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => setO(s.opts)}
                  className="reveal m-row grid w-full grid-cols-[2.5rem_1fr_auto] items-baseline gap-4 border-b border-line py-4 text-left"
                  style={{ "--d": `${i * 50}ms` } as React.CSSProperties}
                >
                  <span className="font-mono text-[11px] text-gold">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-serif text-[clamp(1.1rem,2vw,1.35rem)] font-light">{s.label}</span>
                  <Num value={s.delta} className="font-mono text-[12px]" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="reveal min-w-0">
        <div className="flex items-baseline justify-between border-b border-line pb-3">
          <span className="label">Test a rule set</span>
          {active && (
            <button onClick={() => setO({})} className="font-mono text-[9.5px] tracking-[0.3em] text-ink-3 uppercase hover:text-ink">
              Reset ×
            </button>
          )}
        </div>
        <Stepper label="Max trades a day" value={o.maxTradesPerDay ?? null} onChange={(v) => set({ maxTradesPerDay: v })} min={0} max={20} />
        <Stepper label="Stop after losses in a row" value={o.stopAfterLosses ?? null} onChange={(v) => set({ stopAfterLosses: v })} min={0} max={10} />
        <Stepper label="Daily loss limit" value={o.maxDailyLoss ?? null} onChange={(v) => set({ maxDailyLoss: v })} step={100} min={0} max={10000} format={(n) => fmtMoney(n)} />
        <Stepper label="Walk away when up" value={o.dailyProfitStop ?? null} onChange={(v) => set({ dailyProfitStop: v })} step={100} min={0} max={20000} format={(n) => fmtMoney(n)} />
        <div className={rowCls}>
          <span className={nameCls}>Stop trading at</span>
          <select
            className="field h-8 w-24 py-0 font-mono text-[11.5px]"
            value={cutoffIdx < 0 ? 0 : cutoffIdx}
            onChange={(e) => {
              const c = CUTOFFS[Number(e.target.value)];
              set(c ? { windowStart: 0, windowEnd: c } : { windowStart: null, windowEnd: null });
            }}
            aria-label="Stop trading at"
          >
            {CUTOFFS.map((c, i) => (
              <option key={i} value={i}>
                {c === null ? "off" : hhmm(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="border-b border-line py-3.5">
          <div className={cn(nameCls, "mb-3")}>Skip these days</div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {WEEKDAYS.slice(0, 5).map((w, i) => {
              const on = o.excludeWeekdays?.includes(i);
              return (
                <button
                  key={w}
                  aria-pressed={on}
                  onClick={() => {
                    const cur = o.excludeWeekdays ?? [];
                    set({ excludeWeekdays: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] });
                  }}
                  className={cn("pb-1 font-mono text-[10px] tracking-[0.24em] uppercase transition-colors duration-300", on ? "text-ink line-through decoration-gold" : "text-ink-4 hover:text-ink-2")}
                >
                  {w}
                </button>
              );
            })}
          </div>
        </div>
        <div className={rowCls}>
          <span className={nameCls}>Skip trades tagged with mistakes</span>
          <Toggle checked={!!o.skipMistakeTagged} onChange={(v) => set({ skipMistakeTagged: v })} label="Skip trades tagged with mistakes" />
        </div>
        <div className={rowCls}>
          <span className={nameCls}>Sit out revenge trades</span>
          <Toggle checked={!!o.skipTilt} onChange={(v) => set({ skipTilt: v })} label="Sit out revenge trades" />
        </div>
        <div className={cn(rowCls, "flex-wrap")}>
          <span className={nameCls}>Direction</span>
          <Seg value={o.direction ?? "both"} onChange={(v) => set({ direction: v })} options={[{ value: "both", label: "Both" }, { value: "long", label: "Long" }, { value: "short", label: "Short" }]} />
        </div>
      </div>
    </div>
  );
}
