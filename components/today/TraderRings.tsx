"use client";

import { Flame } from "lucide-react";
import { Rings } from "@/components/ui/Rings";

export const RING_COLORS = { prepare: "#ffd60a", discipline: "#bf5af2", reflect: "#64d2ff" };

export function TraderRingsCard({ prepare, discipline, reflect, streak }: { prepare: number; discipline: number; reflect: number; streak: number }) {
  const rows = [
    { key: "Prepare", value: prepare, color: RING_COLORS.prepare, hint: "Pre-market ritual, readiness & intention" },
    { key: "Discipline", value: discipline, color: RING_COLORS.discipline, hint: "Every trade inside your rules" },
    { key: "Reflect", value: reflect, color: RING_COLORS.reflect, hint: "Post-session review written" },
  ];
  return (
    <div className="flex items-center gap-5 sm:gap-7">
      <div className="shrink-0">
        <Rings
          size={148}
          stroke={15}
          gap={3.5}
          rings={rows.map((r) => ({ value: r.value, color: r.color }))}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold" style={{ color: r.color }}>
                {r.key}
              </span>
              <span className="num text-[15px] font-semibold">{Math.round(r.value * 100)}%</span>
            </div>
            <div className="truncate text-[12px] text-ink-3">{r.hint}</div>
          </div>
        ))}
        <div className="flex items-center gap-1.5 pt-1 text-[12.5px] font-semibold text-orange">
          <Flame size={14} /> {streak}-day ring streak
        </div>
      </div>
    </div>
  );
}
