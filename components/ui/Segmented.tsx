"use client";

import { cn } from "@/lib/cn";

/** Letter-spaced tabs with a gold underline (Meridian). API kept for existing callers. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-x-5 gap-y-2", className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn("relative pb-1.5 font-mono text-[10px] tracking-[0.24em] uppercase transition-colors duration-300", active ? "text-ink" : "text-ink-4 hover:text-ink-2")}
          >
            {o.label}
            <i className={cn("absolute bottom-0 left-0 block h-px bg-gold transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]", active ? "w-full" : "w-0")} />
          </button>
        );
      })}
    </div>
  );
}
