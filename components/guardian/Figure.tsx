import { cn } from "@/lib/cn";

const SIZE = {
  /** Four to a row: five-figure balances still fit on one line. */
  md: "text-[clamp(1.9rem,3.2vw,3.1rem)]",
  /** Three to a row. */
  lg: "text-[clamp(2.1rem,4.1vw,3.6rem)]",
} as const;

/**
 * The kit's Stat, sized for money. A figure never wraps (a "−" and a "$" are
 * both line-break opportunities, so "−$6.24" would otherwise split), a gold
 * unit sits at 0.42em, and an optional hairline meter hangs underneath.
 */
export function Figure({
  value,
  label,
  unit,
  sub,
  tone,
  size = "md",
  d,
  children,
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  unit?: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "pos" | "neg" | null;
  size?: keyof typeof SIZE;
  d?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="reveal min-w-0" style={d ? ({ "--d": `${d}ms` } as React.CSSProperties) : undefined}>
      <div className={cn("num leading-none font-light tracking-[-0.02em] whitespace-nowrap", SIZE[size], tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>
        {value}
        {unit && <span className="ml-[0.3em] text-[0.42em] tracking-[0.04em] text-gold">{unit}</span>}
      </div>
      <div className="mt-4 font-mono text-[10px] leading-[1.6] tracking-[0.18em] text-ink-4 uppercase">{label}</div>
      {sub && <div className="mt-1.5 font-mono text-[11px] leading-[1.7] text-ink-3">{sub}</div>}
      {children}
    </div>
  );
}

/** Mono money that never breaks between its sign and its digits. */
export function Money({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("whitespace-nowrap", className)}>{children}</span>;
}
