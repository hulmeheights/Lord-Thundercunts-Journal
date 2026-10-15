"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { fmtMoney } from "@/lib/format";
import { useSize } from "./useSize";

export type Bar = { label: string; value: number; sub?: string };

export function BarChart({
  data,
  height = 180,
  format = (n: number) => fmtMoney(n, { sign: true, compact: true }),
}: {
  data: Bar[];
  height?: number;
  format?: (n: number) => string;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const hasNeg = data.some((d) => d.value < 0);
  const hasPos = data.some((d) => d.value > 0);
  const labelH = 22;
  const chartH = height - labelH;
  const zeroY = hasNeg && hasPos ? chartH / 2 : hasNeg ? 4 : chartH - 4;
  const scale = hasNeg && hasPos ? chartH / 2 - 8 : chartH - 12;
  const gap = data.length > 16 ? 3 : 6;
  const bw = width > 0 ? Math.max(4, (width - gap * (data.length - 1)) / Math.max(data.length, 1)) : 0;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height}>
          <line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.12)" />
          {data.map((d, i) => {
            const h = (Math.abs(d.value) / max) * scale;
            const xPos = i * (bw + gap);
            const yPos = d.value >= 0 ? zeroY - h : zeroY;
            const color = d.value >= 0 ? "#30d158" : "#ff453a";
            return (
              <g key={d.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={xPos} y={0} width={bw} height={chartH} fill="transparent" />
                <motion.rect
                  x={xPos}
                  width={bw}
                  rx={Math.min(6, bw / 2)}
                  fill={color}
                  fillOpacity={hover === null || hover === i ? 0.9 : 0.35}
                  initial={{ height: 0, y: zeroY }}
                  animate={{ height: Math.max(h, 1.5), y: yPos }}
                  transition={{ type: "spring", stiffness: 120, damping: 18, delay: i * 0.025 }}
                />
                <text x={xPos + bw / 2} y={height - 6} textAnchor="middle" className="fill-[rgba(235,235,245,0.4)] text-[10px]">
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <div
          className="glass-strong pointer-events-none absolute top-0 z-10 rounded-[3px] px-3 py-2 text-[12px]"
          style={{ left: Math.min(Math.max(hover * (bw + gap) + bw / 2 - 60, 0), Math.max(width - 130, 0)) }}
        >
          <div className="text-ink-3">{data[hover]!.label}</div>
          <div className={`num font-semibold ${data[hover]!.value >= 0 ? "text-pos" : "text-neg"}`}>{format(data[hover]!.value)}</div>
          {data[hover]!.sub && <div className="text-ink-3">{data[hover]!.sub}</div>}
        </div>
      )}
    </div>
  );
}
