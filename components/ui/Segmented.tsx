"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/cn";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div className={cn("inline-flex rounded-full border border-line bg-fill-2 p-[3px]", className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative rounded-full font-medium transition-colors duration-200",
              size === "sm" ? "h-7 px-3 text-[12px]" : "h-8 px-4 text-[13px]",
              active ? "text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full border border-line bg-surface shadow-[0_1px_2px_rgba(11,15,12,0.08)]"
                transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
