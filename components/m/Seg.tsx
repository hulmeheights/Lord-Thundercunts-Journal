"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

type Opt<T extends string> = { value: T; label: React.ReactNode; href?: string };

/** Letter-spaced tabs; the active one gets cream ink and a gold underline. Works as buttons or links. */
export function Seg<T extends string>({ options, value, onChange, className }: { options: Opt<T>[]; value: T; onChange?: (v: T) => void; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-2", className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        const cls = cn(
          "relative pb-1.5 font-mono text-[10px] tracking-[0.26em] uppercase transition-colors duration-300",
          active ? "text-ink" : "text-ink-4 hover:text-ink-2",
        );
        const bar = <i className={cn("absolute bottom-0 left-0 block h-px bg-gold transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]", active ? "w-full" : "w-0")} />;
        return o.href ? (
          <Link key={o.value} href={o.href} role="tab" aria-selected={active} className={cls} scroll={false}>
            {o.label}
            {bar}
          </Link>
        ) : (
          <button key={o.value} type="button" role="tab" aria-selected={active} onClick={() => onChange?.(o.value)} className={cls}>
            {o.label}
            {bar}
          </button>
        );
      })}
    </div>
  );
}
