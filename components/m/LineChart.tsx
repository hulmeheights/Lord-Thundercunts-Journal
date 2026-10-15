"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";

export type LineSeries = { values: number[]; tone?: "pos" | "ink" | "gold"; dashed?: boolean; label?: string };

/**
 * Hairline chart in the Meridian style: a soft-glow jade line, a quiet
 * zero line, optional ghost series (dashed). Scrub to read values.
 */
export function LineChart({
  series,
  labels,
  height = 220,
  zero = true,
  className,
  format = (v: number) => fmtMoney(v, { sign: true }),
}: {
  series: LineSeries[];
  labels?: string[];
  height?: number;
  zero?: boolean;
  className?: string;
  format?: (v: number) => string;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = 300;
  const { lo, hi, n } = useMemo(() => {
    const all = series.flatMap((s) => s.values).concat(zero ? [0] : []);
    return { lo: Math.min(...all), hi: Math.max(...all), n: Math.max(...series.map((s) => s.values.length), 2) };
  }, [series, zero]);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - 18 - ((v - lo) / span) * (H - 36);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const color = (t?: string) => (t === "ink" ? "var(--ink)" : t === "gold" ? "var(--gold)" : "var(--pos)");
  const main = series[0];

  return (
    <div className={cn("relative", className)} style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`f${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--pos)" stopOpacity="0.1" />
            <stop offset="1" stopColor="var(--pos)" stopOpacity="0" />
          </linearGradient>
          <filter id={`g${id}`} x="-5%" y="-30%" width="110%" height="160%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        {zero && lo < 0 && hi > 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--line-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        {main && main.values.length > 1 && (
          <path d={`${path(main.values)} L${x(main.values.length - 1)},${H} L0,${H} Z`} fill={`url(#f${id})`} />
        )}
        {series.map((s, k) => (
          <g key={k}>
            {!s.dashed && <path d={path(s.values)} fill="none" stroke={color(s.tone)} strokeWidth="6" opacity="0.25" filter={`url(#g${id})`} vectorEffect="non-scaling-stroke" />}
            <path d={path(s.values)} fill="none" stroke={color(s.tone)} strokeWidth="1.6" strokeDasharray={s.dashed ? "5 6" : undefined} strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={s.dashed ? 0.8 : 1} />
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--line-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hover !== null && main && (
        <div className="pointer-events-none absolute top-0 border border-line bg-bg px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2" style={{ left: `clamp(0px, calc(${(hover / (n - 1)) * 100}% - 40px), calc(100% - 120px))` }}>
          {labels?.[hover] && <span className="mr-2 text-ink-4">{labels[hover]}</span>}
          {series.map((s, k) => (s.values[hover] !== undefined ? <span key={k} className={k ? "ml-2 text-ink-3" : ""}>{format(s.values[hover]!)}</span> : null))}
        </div>
      )}
    </div>
  );
}
