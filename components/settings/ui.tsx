import { cn } from "@/lib/cn";

/** A settings line: mono name (and hint) on the left, the control on the right, a hairline under it. */
export function SRow({ name, hint, children, className, stack }: { name: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode; className?: string; stack?: boolean }) {
  return (
    <div className={cn("flex gap-x-6 gap-y-3 border-b border-line py-4", stack ? "flex-col" : "flex-wrap items-center justify-between", className)}>
      <div className="min-w-0">
        <div className="font-mono text-[11.5px] tracking-[0.05em] text-ink">{name}</div>
        {hint && <div className="mt-1 max-w-[52ch] font-mono text-[10.5px] leading-[1.75] text-ink-4">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/** A small sub-heading inside a section: letter-spaced, quiet, with an optional count or action. */
export function Sub({ children, aside, className }: { children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 border-b border-line pb-3", className)}>
      <span className="font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">{children}</span>
      {aside}
    </div>
  );
}

/** One-line status note: jade for good news, cream otherwise. Never red. */
export function Note({ children, tone, className }: { children: React.ReactNode; tone?: "pos" | "warn"; className?: string }) {
  return (
    <p className={cn("font-mono text-[11px] leading-[1.8]", tone === "pos" ? "text-pos" : tone === "warn" ? "text-ink" : "text-ink-3", className)} role={tone === "warn" ? "alert" : undefined}>
      {tone === "warn" && <span className="mr-2 text-gold">◆</span>}
      {children}
    </p>
  );
}

/** Square hairline × for removing a list item. */
export function RemoveX({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid h-7 w-7 shrink-0 place-items-center font-mono text-[13px] text-ink-4 transition-colors duration-300 hover:text-ink">
      ×
    </button>
  );
}

export const lineInput =
  "w-full border-0 border-b border-line-2 bg-transparent py-2 font-mono text-[12px] tracking-[0.03em] text-ink outline-none transition-colors duration-300 placeholder:text-ink-4 focus:border-gold focus-visible:outline-none";
