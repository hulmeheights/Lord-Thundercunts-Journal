"use client";

import { useState, useTransition } from "react";
import { tickCapsuleGoal } from "@/lib/actions/journal";
import type { GoalResult } from "@/lib/analytics/capsule";
import { cn } from "@/lib/cn";

/**
 * A capsule's goals: green with a tick when met, struck through when missed,
 * a hairline of progress while it's still sealed. Your own goals tick by hand.
 */
export function CapsuleGoals({ capsuleId, results, className }: { capsuleId: string; results: GoalResult[]; className?: string }) {
  const [done, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(results.filter((r) => r.manual).map((r) => [r.goal.id, !!r.goal.done])));
  const [, start] = useTransition();
  if (!results.length) return null;
  return (
    <ul className={cn("space-y-3", className)} aria-label="Goals">
      {results.map((r) => {
        const manualDone = r.manual ? done[r.goal.id] : false;
        const met = r.manual ? (manualDone ? true : null) : r.met;
        return (
          <li key={r.goal.id} className="grid grid-cols-[1.4rem_minmax(0,1fr)_auto] items-baseline gap-x-3">
            {r.manual ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={manualDone}
                aria-label={`Tick: ${r.label}`}
                onClick={() => {
                  const next = !manualDone;
                  setDone((d) => ({ ...d, [r.goal.id]: next }));
                  start(() => void tickCapsuleGoal(capsuleId, r.goal.id, next));
                }}
                className={cn("grid h-4 w-4 place-items-center border text-[10px] leading-none", manualDone ? "border-pos text-pos" : "border-line-2 text-transparent hover:border-ink-3")}
              >
                ✓
              </button>
            ) : (
              <span aria-hidden className={cn("font-mono text-[12px]", met === true ? "text-pos" : met === false ? "text-ink-4" : "text-gold")}>
                {met === true ? "✓" : met === false ? "×" : "◆"}
              </span>
            )}
            <span className="min-w-0">
              <span className={cn("font-serif text-[1.05rem] leading-[1.4] font-light", met === true ? "text-pos" : met === false ? "text-ink-3 line-through decoration-ink-4" : "text-ink")}>
                {r.label}
              </span>
              {met === null && !r.manual && (
                <span className="mt-1.5 block h-px w-full max-w-[16rem] bg-line">
                  <span className="block h-px bg-gold" style={{ width: `${Math.round(r.progress * 100)}%` }} />
                </span>
              )}
            </span>
            <span className={cn("num text-right font-mono text-[10.5px]", met === true ? "text-pos" : "text-ink-4")}>{r.manual ? (manualDone ? "ticked" : "tick it") : r.actual}</span>
          </li>
        );
      })}
    </ul>
  );
}
