"use client";

import { motion } from "motion/react";
import { useId, useMemo, useState } from "react";
import { fmtMoney } from "@/lib/format";
import { niceExtent, smoothPath } from "./path";
import { useSize } from "./useSize";

export type Series = { values: number[]; color?: string; dashed?: boolean; fill?: boolean; label?: string };

export function AreaChart({
  series,
  labels,
  height = 220,
  format = (n: number) => fmtMoney(n, { sign: true }),
  showZero = true,
  interactive = true,
  animate = true,
}: {
  series: Series[];
  labels?: string[];
  height?: number;
  format?: (n: number) => string;
  showZero?: boolean;
  interactive?: boolean;
  animate?: boolean;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const len = Math.max(...series.map((s) => s.values.length), 0);
  const all = series.flatMap((s) => s.values);
  const [lo, hi] = niceExtent(all.length ? all : [0], showZero);
  const padX = 4, padTop = 12, padBottom = 12;
  const w = Math.max(width, 10);
  const x = (i: number) => padX + (len <= 1 ? 0 : (i / (len - 1)) * (w - padX * 2));
  const y = (v: number) => padTop + (1 - (v - lo) / (hi - lo)) * (height - padTop - padBottom);

  const paths = useMemo(
    () =>
      series.map((s) => {
        const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number]);
        const line = smoothPath(pts);
        const base = y(Math.max(lo, Math.min(hi, 0)));
        const area = pts.length ? `${line}L${pts[pts.length - 1]![0]},${base}L${pts[0]![0]},${base}Z` : "";
        return { line, area };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, w, height, lo, hi],
  );

  const primary = series[0];
  const last = primary?.values[primary.values.length - 1] ?? 0;
  const autoColor = last >= 0 ? "#30d158" : "#ff453a";

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && len > 0 && (
        <svg
          width={w}
          height={height}
          className="overflow-visible"
          onPointerMove={(e) => {
            if (!interactive) return;
            const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
            const px = e.clientX - rect.left;
            const i = Math.round(((px - padX) / (w - padX * 2)) * (len - 1));
            setHover(Math.max(0, Math.min(len - 1, i)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`${id}-f${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color ?? autoColor} stopOpacity={0.32} />
                <stop offset="100%" stopColor={s.color ?? autoColor} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {showZero && lo < 0 && hi > 0 && (
            <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 5" />
          )}
          {series.map((s, i) => (
            <g key={i}>
              {s.fill !== false && !s.dashed && (
                <motion.path
                  d={paths[i]!.area}
                  fill={`url(#${id}-f${i})`}
                  initial={animate ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                />
              )}
              <motion.path
                d={paths[i]!.line}
                fill="none"
                stroke={s.color ?? autoColor}
                strokeWidth={s.dashed ? 1.75 : 2.25}
                strokeDasharray={s.dashed ? "5 6" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={animate ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              />
            </g>
          ))}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padTop - 6} y2={height - padBottom} stroke="rgba(255,255,255,0.25)" />
              {series.map((s, i) =>
                s.values[hover] !== undefined ? (
                  <circle key={i} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={s.color ?? autoColor} stroke="#000" strokeWidth={2} />
                ) : null,
              )}
            </g>
          )}
        </svg>
      )}
      {hover !== null && primary && (
        <div
          className="glass-strong pointer-events-none absolute top-0 z-10 rounded-xl px-3 py-2 text-[12px] shadow-xl"
          style={{ left: Math.min(Math.max(x(hover) - 70, 0), w - 150), transform: "translateY(-105%)" }}
        >
          {labels?.[hover] && <div className="mb-0.5 text-ink-3">{labels[hover]}</div>}
          {series.map((s, i) =>
            s.values[hover] !== undefined ? (
              <div key={i} className="num flex items-center gap-2 font-semibold">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color ?? autoColor }} />
                {s.label && <span className="font-normal text-ink-3">{s.label}</span>}
                {format(s.values[hover]!)}
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
