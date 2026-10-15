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

  const color = score >= 70 ? "#30d158" : score >= 45 ? "#ffd60a" : "#ff453a";
  const verdict = score >= 70 ? "Green light. Trade your plan." : score >= 45 ? "Proceed with care. Consider half size." : "Red flag. Smaller size — or sit out.";

  return (
    <div>
      <div className="mb-5 flex items-center gap-4">
        <div className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${saved ? score * 3.6 : 0}deg, rgba(255,255,255,0.08) 0deg)` }}>
          <div className="grid h-[52px] w-[52px] place-items-center rounded-full bg-[#0c0c0e]">
            <span className="num text-[18px] font-bold">{saved ? score : "–"}</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">{saved ? verdict : "How are you showing up today?"}</div>
          {insight && <div className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{insight}</div>}
        </div>
      </div>
      <div className="space-y-3.5">
        {METRICS.map((m) => (
          <div key={m.key}>
            <div className="mb-1.5 flex justify-between text-[12.5px]">
              <span className="font-semibold text-ink-2">{m.label}</span>
              <span className="text-ink-4">{r[m.key] <= 2 ? m.low : r[m.key] >= 4 ? m.high : ""}</span>
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  onClick={() => set(m.key, v)}
                  className={cn("relative h-8 flex-1 rounded-xl transition-colors", v <= r[m.key] && saved ? "" : "bg-fill-2 hover:bg-fill-3")}
                  aria-label={`${m.label} ${v}`}
                >
                  {v <= r[m.key] && saved && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 0.35 + v * 0.13, scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30, delay: v * 0.03 }}
                      className="absolute inset-0 rounded-xl"
                      style={{ background: color }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5">
        <label className="eyebrow mb-1.5 block">One intention for today</label>
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
