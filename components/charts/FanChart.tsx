"use client";

import { useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { niceExtent, smoothPath } from "./path";
import { useSize } from "./useSize";

type Band = { day: number; p10: number; p50: number; p90: number };

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Monte Carlo fan in the Meridian hand: the middle 80% of futures as a hairline
 * band, the median as the glowing jade line, the target as a gold dashed rule
 * and the max-loss floor as a cream dashed rule. Scrub to read any day.
 */
export function FanChart({
  bands,
  target,
  floor,
  className,
}: {
  bands: Band[];
  target: number | null;
  floor: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const reduced = useReducedMotion();
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const w = Math.max(width, 10);
  const height = Math.round(Math.min(360, Math.max(230, w * 0.34)));
  const top = 30;
  const bottom = 34;
  const n = bands.length;

  const geo = useMemo(() => {
    const values = bands.flatMap((b) => [b.p10, b.p90]).concat(floor, target ?? floor);
    const [lo, hi] = niceExtent(values, false);
    const x = (i: number) => (i / Math.max(n - 1, 1)) * (w - 10) + 4;
    const y = (v: number) => top + (1 - (v - lo) / (hi - lo || 1)) * (height - top - bottom);
    const upper = bands.map((b, i) => [x(i), y(b.p90)] as [number, number]);
    const lower = bands.map((b, i) => [x(i), y(b.p10)] as [number, number]);
    const lowerRev = [...lower].reverse();
    const band = n > 1 ? `${smoothPath(upper)}L${lowerRev[0]![0]},${lowerRev[0]![1]}${smoothPath(lowerRev).replace(/^M[^C]+/, "")}Z` : "";
    return {
      x,
      y,
      band,
      upper: smoothPath(upper),
      lower: smoothPath(lower),
      median: smoothPath(bands.map((b, i) => [x(i), y(b.p50)] as [number, number])),
    };
  }, [bands, floor, target, w, height, n]);

  if (n < 2) return <div ref={ref} className={cn("w-full", className)} style={{ height: 230 }} />;

  const last = bands[n - 1]!;
  const ticks = [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1];
  const draw = reduced ? { pathLength: 1, opacity: 1 } : undefined;
  const hb = hover !== null ? bands[hover] : null;
  const yTarget = target !== null ? geo.y(target) : null;
  const yFloor = geo.y(floor);
  // Keep the two rule labels from colliding when the rules sit close together.
  const floorLabelBelow = yTarget !== null && Math.abs(yTarget - yFloor) < 26;

  return (
    <div ref={ref} className={cn("relative w-full select-none", className)} style={{ height }}>
      {width > 0 && (
        <svg
          width={w}
          height={height}
          className="block touch-pan-y overflow-visible"
          role="img"
          aria-label={`Median path ends near ${fmtMoney(last.p50)}; middle 80% of outcomes between ${fmtMoney(last.p10)} and ${fmtMoney(last.p90)}.`}
          onPointerMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left - 4) / (r.width - 10)) * (n - 1)))));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <filter id={`g${id}`} x="-5%" y="-40%" width="110%" height="180%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          {/* baseline + day ticks */}
          <line x1={0} x2={w} y1={height - bottom + 10} y2={height - bottom + 10} stroke="var(--line)" />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={geo.x(t)} x2={geo.x(t)} y1={height - bottom + 6} y2={height - bottom + 10} stroke="var(--line-2)" />
              <text
                x={geo.x(t)}
                y={height - 6}
                textAnchor={t === 0 ? "start" : t === n - 1 ? "end" : "middle"}
                className="fill-ink-4 font-mono text-[9px] tracking-[0.22em] uppercase"
              >
                {t === 0 ? "Today" : t === n - 1 ? `+${t} days` : `+${t}`}
              </text>
            </g>
          ))}

          {/* the middle 80% of futures */}
          <motion.path
            d={geo.band}
            fill="var(--ink)"
            fillOpacity={0.035}
            initial={reduced ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 1.4, ease: EASE, delay: 0.5 }}
          />
          {[geo.upper, geo.lower].map((d, k) => (
            <motion.path
              key={k}
              d={d}
              fill="none"
              stroke="var(--ink)"
              strokeOpacity={0.2}
              strokeWidth={1}
              initial={reduced ? false : { pathLength: 0, opacity: 0 }}
              whileInView={draw ?? { pathLength: 1, opacity: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 1.8, ease: EASE, delay: 0.2 }}
            />
          ))}

          {/* target (gold) and floor (cream) */}
          {yTarget !== null && target !== null && (
            <g>
              <line x1={0} x2={w} y1={yTarget} y2={yTarget} stroke="var(--gold)" strokeDasharray="5 7" strokeOpacity={0.85} />
              <text x={2} y={yTarget - 8} className="fill-gold font-mono text-[9px] tracking-[0.24em] uppercase">
                Target · {fmtMoney(target)}
              </text>
            </g>
          )}
          <line x1={0} x2={w} y1={yFloor} y2={yFloor} stroke="var(--neg)" strokeDasharray="5 7" strokeOpacity={0.45} />
          <text x={2} y={floorLabelBelow ? yFloor + 16 : yFloor - 8} className="fill-ink-3 font-mono text-[9px] tracking-[0.24em] uppercase">
            Max loss · {fmtMoney(floor)}
          </text>

          {/* the median future */}
          <motion.path
            d={geo.median}
            fill="none"
            stroke="var(--pos)"
            strokeWidth={6}
            opacity={0.25}
            filter={`url(#g${id})`}
            initial={reduced ? false : { pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 2, ease: EASE }}
          />
          <motion.path
            d={geo.median}
            fill="none"
            stroke="var(--pos)"
            strokeWidth={1.6}
            strokeLinecap="round"
            initial={reduced ? false : { pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 2, ease: EASE }}
          />
          <circle cx={geo.x(0)} cy={geo.y(bands[0]!.p50)} r={3} fill="var(--ink)" />
          <motion.g
            initial={reduced ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, delay: 1.8 }}
          >
            <circle cx={geo.x(n - 1)} cy={geo.y(last.p50)} r={3} fill="var(--pos)" />
            <text x={geo.x(n - 1) - 10} y={geo.y(last.p50) - 10} textAnchor="end" className="num fill-pos text-[11px]">
              {fmtMoney(last.p50)}
            </text>
          </motion.g>

          {/* scrub */}
          {hb && hover !== null && (
            <g pointerEvents="none">
              <line x1={geo.x(hover)} x2={geo.x(hover)} y1={top - 8} y2={height - bottom + 10} stroke="var(--line-2)" />
              <circle cx={geo.x(hover)} cy={geo.y(hb.p90)} r={2} fill="var(--ink-3)" />
              <circle cx={geo.x(hover)} cy={geo.y(hb.p10)} r={2} fill="var(--ink-3)" />
              <circle cx={geo.x(hover)} cy={geo.y(hb.p50)} r={3} fill="var(--pos)" />
            </g>
          )}
        </svg>
      )}
      {hb && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 border border-line bg-bg px-2.5 py-1.5 font-mono text-[10px] leading-[1.7] tracking-[0.06em] whitespace-nowrap text-ink-2"
          style={{ left: `clamp(0px, ${geo.x(hover) - 70}px, calc(100% - 190px))` }}
        >
          <span className="text-ink-4">{hover === 0 ? "TODAY" : `DAY +${hover}`}</span>
          <span className="ml-2 text-pos">{fmtMoney(hb.p50)}</span>
          <span className="block text-ink-4">
            80% · {fmtMoney(hb.p10)} – {fmtMoney(hb.p90)}
          </span>
        </div>
      )}
    </div>
  );
}
