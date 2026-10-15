"use client";

import { motion } from "motion/react";

/** A 240° arc gauge. `value` is 0–1. */
export function Gauge({
  value,
  size = 200,
  stroke = 14,
  from = "#ff453a",
  via = "#ffd60a",
  to = "#30d158",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  from?: string;
  via?: string;
  to?: string;
  children?: React.ReactNode;
}) {
  const r = size / 2 - stroke;
  const c = size / 2;
  const start = 150, sweep = 240;
  const v = Math.max(0, Math.min(1, value));
  const polar = (deg: number) => [c + r * Math.cos((deg * Math.PI) / 180), c + r * Math.sin((deg * Math.PI) / 180)];
  const [sx, sy] = polar(start);
  const [ex, ey] = polar(start + sweep);
  const arc = `M${sx},${sy} A${r},${r} 0 1 1 ${ex},${ey}`;
  const len = (sweep / 360) * 2 * Math.PI * r;
  const gid = `g${Math.round(size)}${Math.round(stroke)}`;
  return (
    <div className="relative" style={{ width: size, height: size * 0.82 }}>
      <svg width={size} height={size} className="absolute top-0 left-0">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={from} />
            <stop offset="50%" stopColor={via} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <path d={arc} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} strokeLinecap="round" />
        <motion.path
          d={arc}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={len}
          initial={{ strokeDashoffset: len }}
          animate={{ strokeDashoffset: len * (1 - v) }}
          transition={{ type: "spring", stiffness: 40, damping: 15, delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center pt-2">{children}</div>
    </div>
  );
}
