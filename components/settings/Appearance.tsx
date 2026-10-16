"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { readUiPrefs, writeUiPrefs } from "@/lib/ui-prefs-client";
import type { LossPref, UiPrefs } from "@/lib/ui-prefs";
import { Toggle } from "@/components/ui/Toggle";
import { SRow } from "./ui";

const LOSSES: { value: LossPref; label: string; color: string; note: string }[] = [
  { value: "mono", label: "Cream", color: "#ece7dd", note: "Like your candles: up is jade, down is white." },
  { value: "red", label: "Clay", color: "#c9806f", note: "A muted clay for those who want a warmer warning." },
];

/** Appearance lives in a cookie so the very first paint is already right. */
export function Appearance({ initial }: { initial: UiPrefs }) {
  const [p, setP] = useState(initial);
  const set = (patch: Partial<UiPrefs>) => setP(writeUiPrefs({ ...readUiPrefs(), ...patch }));
  return (
    <div className="max-w-3xl">
      <SRow name="Losses are shown in" hint="Gains are always jade. Every loss also carries a − sign, so colour is never the only cue." stack>
        <div className="grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label="Loss colour">
          {LOSSES.map((l) => {
            const on = p.loss === l.value;
            return (
              <button
                key={l.value}
                role="radio"
                aria-checked={on}
                onClick={() => set({ loss: l.value })}
                className={cn("border p-5 text-left transition-colors duration-300", on ? "border-gold" : "border-line hover:border-line-2")}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-mono text-[10px] tracking-[0.3em] text-ink-3 uppercase">
                    {on && <span className="mr-2 text-gold">◆</span>}
                    {l.label}
                  </span>
                  <span className="font-mono text-[11px]">
                    <span className="text-pos">+$546</span> <span style={{ color: l.color }}>−$1,392</span>
                  </span>
                </div>
                <div className="mt-4 flex h-9 items-end gap-[3px]" aria-hidden>
                  {[5, 8, -6, 11, 7, -9, 4, 12, -4, 9, -11, 6, 10, -5, 8, 13].map((v, i) => (
                    <i key={i} className="block w-[3px]" style={{ height: `${Math.abs(v) * 2.4}px`, background: v > 0 ? "var(--pos)" : l.color, opacity: v > 0 ? 0.9 : 0.85 }} />
                  ))}
                </div>
                <p className="mt-4 font-mono text-[10.5px] leading-[1.75] text-ink-4">{l.note}</p>
              </button>
            );
          })}
        </div>
      </SRow>
      <SRow name="Opening sequence" hint="Once a day, the name and the connecting line before Today. Tap anywhere to skip it.">
        <Toggle checked={p.intro} onChange={(v) => set({ intro: v })} label="Opening sequence" />
      </SRow>
    </div>
  );
}
