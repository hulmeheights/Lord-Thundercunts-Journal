"use client";

import { motion } from "motion/react";
import { fmtMoney } from "@/lib/format";
import { niceExtent, smoothPath } from "./path";
import { useSize } from "./useSize";

/** Monte Carlo fan: 10th–90th percentile band, median path, target and floor. */
export function FanChart({
  bands,
  target,
  floor,
  height = 220,
}: {
  bands: { day: number; p10: number; p50: number; p90: number }[];
  target: number | null;
  floor: number;
  height?: number;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const values = bands.flatMap((b) => [b.p10, b.p90]).concat(floor, target ?? floor);
  const [lo, hi] = niceExtent(values, false);
  const w = Math.max(width, 10);
  const x = (i: number) => (i / Math.max(bands.length - 1, 1)) * (w - 8) + 4;
  const y = (v: number) => 10 + (1 - (v - lo) / (hi - lo)) * (height - 20);
  const top = bands.map((b, i) => [x(i), y(b.p90)] as [number, number]);
  const bottom = bands.map((b, i) => [x(i), y(b.p10)] as [number, number]).reverse();
  const band = `${smoothPath(top)}L${bottom[0]![0]},${bottom[0]![1]}${smoothPath(bottom).replace(/^M[^C]+/, "")}Z`;
  const median = smoothPath(bands.map((b, i) => [x(i), y(b.p50)] as [number, number]));

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && bands.length > 1 && (
        <svg width={w} height={height}>
          <defs>
            <linearGradient id="fan" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#5e5ce6" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#bf5af2" stopOpacity={0.35} />
            </linearGradient>
          </defs>
          <motion.path d={band} fill="url(#fan)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
          <motion.path
            d={median}
            fill="none"
            stroke="#64d2ff"
            strokeWidth={2.25}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2 }}
          />
          {target !== null && (
            <g>
              <line x1={0} x2={w} y1={y(target)} y2={y(target)} stroke="#30d158" strokeDasharray="4 5" strokeOpacity={0.7} />
              <text x={w - 4} y={y(target) - 6} textAnchor="end" className="fill-[#30d158] text-[10px] font-semibold">
                Target {fmtMoney(target)}
              </text>
            </g>
          )}
          <line x1={0} x2={w} y1={y(floor)} y2={y(floor)} stroke="#ff453a" strokeDasharray="4 5" strokeOpacity={0.7} />
          <text x={w - 4} y={y(floor) + 14} textAnchor="end" className="fill-[#ff453a] text-[10px] font-semibold">
            Max loss {fmtMoney(floor)}
          </text>
        </svg>
      )}
    </div>
  );
}
