"use client";

import { Rings } from "@/components/ui/Rings";

/** One hue, three intensities: green is earned, so an open ring stays quiet. */
export const RING_COLORS = { prepare: "var(--pos)", discipline: "color-mix(in oklab, var(--pos) 72%, var(--glow))", reflect: "var(--glow)" };

export function TraderRingsCard({ prepare, discipline, reflect, streak }: { prepare: number; discipline: number; reflect: number; streak: number }) {
  const rows = [
    { key: "Prepare", value: prepare, color: RING_COLORS.prepare, hint: "Ritual, readiness and intention" },
    { key: "Discipline", value: discipline, color: RING_COLORS.discipline, hint: "Every trade inside your rules" },
    { key: "Reflect", value: reflect, color: RING_COLORS.reflect, hint: "Review written after the close" },
  ];
  const closed = rows.filter((r) => r.value >= 0.999).length;
  return (
    <div className="flex items-center gap-6 sm:gap-8">
      <div className="relative shrink-0">
        <Rings size={136} stroke={9} gap={6} rings={rows.map((r) => ({ value: r.value, color: r.color }))} />
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="num-display text-[30px] leading-none font-semibold">{closed}/3</div>
            <div className="eyebrow mt-1 !text-[9px]">closed</div>
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 divide-y divide-line">
        {rows.map((r) => (
          <div key={r.key} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0">
            <div className="min-w-0">
              <div className="text-[14px] font-medium">{r.key}</div>
              <div className="truncate text-[12.5px] text-ink-3">{r.hint}</div>
            </div>
            <span className={`num text-[14px] ${r.value >= 0.999 ? "text-pos" : "text-ink-3"}`}>{Math.round(r.value * 100)}%</span>
          </div>
        ))}
        <div className="pt-2.5 text-[12.5px] text-ink-3">
          <span className="num text-ink">{streak}</span> day{streak === 1 ? "" : "s"} in a row with all three closed
        </div>
      </div>
    </div>
  );
}
