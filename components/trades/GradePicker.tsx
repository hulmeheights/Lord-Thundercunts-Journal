"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { GRADES, GRADE_HINT, type Grade } from "@/lib/analytics/grades";
import { saveTradeJournal } from "@/lib/actions/trades";

/** A+ to F as square letters; tap the chosen one again to clear it. */
export function GradePicker({ value, onChange, small, label = "Grade" }: { value: Grade | null; onChange: (g: Grade | null) => void; small?: boolean; label?: string }) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
      {GRADES.map((g) => {
        const on = value === g;
        return (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={on}
            title={GRADE_HINT[g]}
            onClick={() => onChange(on ? null : g)}
            className={cn(
              "grid place-items-center rounded-[2px] border font-mono tracking-[0.04em] transition-[color,border-color,background-color] duration-300",
              small ? "h-7 w-8 text-[10.5px]" : "h-10 w-11 text-[12.5px]",
              on ? (g === "F" || g === "C" ? "border-ink/45 bg-ink/5 text-neg" : "border-gold/60 bg-gold/10 text-gold") : "border-line text-ink-3 hover:border-line-2 hover:text-ink",
            )}
          >
            {g}
          </button>
        );
      })}
    </div>
  );
}

/** The picker wired to one trade, saving as you tap (for lists like the day's tape). */
export function TradeGrade({ id, initial, label }: { id: string; initial: Grade | null; label: string }) {
  const [g, setG] = useState(initial);
  const [, start] = useTransition();
  return (
    <GradePicker
      small
      label={label}
      value={g}
      onChange={(next) => {
        setG(next);
        start(async () => void (await saveTradeJournal(id, { grade: next })));
      }}
    />
  );
}
