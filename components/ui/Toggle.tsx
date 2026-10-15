"use client";

import { cn } from "@/lib/cn";

/** A hairline switch: a square track and a dot that slides and turns jade. */
export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-[18px] w-[38px] shrink-0 border transition-colors duration-300 disabled:opacity-40", checked ? "border-pos/60" : "border-line-2")}
    >
      <span
        className={cn("absolute top-1/2 h-[8px] w-[8px] -translate-y-1/2 rounded-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]", checked ? "left-[24px] bg-pos shadow-[0_0_10px_rgba(116,184,156,0.7)]" : "left-[4px] bg-ink-4")}
      />
    </button>
  );
}
