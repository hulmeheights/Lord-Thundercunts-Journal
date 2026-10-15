"use client";

import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { saveJournal } from "@/lib/actions/journal";
import type { Readiness as R } from "@/lib/types";

const METRICS: { key: keyof R; label: string; low: string; high: string }[] = [
  { key: "sleep", label: "Sleep", low: "Wrecked", high: "Rested" },
  { key: "energy", label: "Energy", low: "Flat", high: "Charged" },
  { key: "focus", label: "Focus", low: "Scattered", high: "Locked in" },
  { key: "mood", label: "Mood", low: "Heavy", high: "Light" },
];

export function readinessScore(r: R | null): number | null {
  if (!r) return null;
  return Math.round(((r.sleep + r.energy + r.focus + r.mood - 4) / 16) * 100);
}

export function Readiness({ day, initial, initialIntention, insight }: { day: string; initial: R | null; initialIntention: string | null; insight: string | null }) {
  const [r, setR] = useState<R>(initial ?? { sleep: 3, energy: 3, focus: 3, mood: 3 });
  const [saved, setSaved] = useState(Boolean(initial));
  const [intention, setIntention] = useState(initialIntention ?? "");
  const [, start] = useTransition();
  const score = readinessScore(r)!;

  const set = (k: keyof R, v: number) => {
    const next = { ...r, [k]: v };
    setR(next);
    setSaved(true);
    start(async () => {
      await saveJournal(day, { readiness: next });
    });
  };

  const verdict = score >= 70 ? "Green light. Trade your plan." : score >= 45 ? "Proceed with care — half size." : "Sit out, or trade tiny.";

  return (
    <div>
      <div className="mb-6 flex items-end gap-5">
        <div className="shrink-0">
          <div className={cn("num-display text-[52px] leading-none font-semibold transition-colors duration-500", saved && score >= 70 ? "text-pos" : "text-ink")}>
            {saved ? score : "—"}
          </div>
          <div className="eyebrow mt-1.5">Readiness</div>
        </div>
        <div className="min-w-0 pb-1">
          <div className="text-[15px] font-medium">{saved ? verdict : "How are you showing up today?"}</div>
          {insight && <div className="mt-1 text-[12.5px] leading-snug text-ink-3">{insight}</div>}
        </div>
      </div>
      <div className="space-y-4">
        {METRICS.map((m) => (
          <div key={m.key} className="flex items-center gap-4">
            <span className="w-16 shrink-0 text-[13.5px] text-ink-2">{m.label}</span>
            <div className="flex flex-1 gap-1.5">
              {[1, 2, 3, 4, 5].map((v) => {
                const on = saved && v <= r[m.key];
                return (
                  <button
                    key={v}
                    onClick={() => set(m.key, v)}
                    className="group relative h-9 flex-1 rounded-full border border-line-2 transition-colors duration-300 hover:border-ink-4"
                    aria-label={`${m.label} ${v}`}
                    aria-pressed={on}
                  >
                    {on && (
                      <motion.span
                        layoutId={undefined}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.25 + v * 0.15 }}
                        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: v * 0.03 }}
                        className="absolute inset-[3px] rounded-full bg-pos"
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <span className="hidden w-16 shrink-0 text-right text-[12px] text-ink-4 sm:block">{r[m.key] <= 2 ? m.low : r[m.key] >= 4 ? m.high : ""}</span>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <label className="eyebrow mb-2 block">One intention for today</label>
        <input
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
          onBlur={() => start(async () => void (await saveJournal(day, { intention: intention.trim() || null })))}
          placeholder="e.g. Two trades max, then walk away."
          className="field"
          maxLength={500}
        />
      </div>
    </div>
  );
}
