"use client";

import { motion } from "motion/react";

export type RingSpec = { value: number; color: string; track?: string; label?: string };

/**
 * Apple-Fitness-style concentric rings. Values above 1 wrap with a darker
 * overlap so overachievement is visible.
 */
export function Rings({
  rings,
  size = 160,
  stroke = 16,
  gap = 4,
  animate = true,
}: {
  rings: RingSpec[];
  size?: number;
  stroke?: number;
  gap?: number;
  animate?: boolean;
}) {
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      {rings.map((r, i) => {
        const radius = c - stroke / 2 - i * (stroke + gap);
        if (radius <= 0) return null;
        const circ = 2 * Math.PI * radius;
        const v = Math.max(0, Math.min(1, r.value));
        return (
          <g key={i}>
            <circle cx={c} cy={c} r={radius} fill="none" stroke={r.track ?? `${r.color}2e`} strokeWidth={stroke} />
            <motion.circle
              cx={c}
              cy={c}
              r={radius}
              fill="none"
              stroke={r.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              initial={animate ? { strokeDashoffset: circ } : false}
              animate={{ strokeDashoffset: circ * (1 - Math.max(v, 0.0001)) }}
              transition={{ type: "spring", stiffness: 40, damping: 14, delay: 0.15 + i * 0.12 }}
              style={{ filter: v >= 0.999 ? `drop-shadow(0 0 6px ${r.color}88)` : undefined }}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function ProgressRing({
  value,
  size = 56,
  stroke = 6,
  color = "#64d2ff",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <Rings rings={[{ value, color }]} size={size} stroke={stroke} />
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  );
}
