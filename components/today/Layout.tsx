import { cn } from "@/lib/cn";

const delay = (d?: number) => (d ? ({ "--d": `${d}ms` } as React.CSSProperties) : undefined);

/**
 * A numbered chapter of the Today scroll. Like the kit's Section, with the
 * longer Meridian rhythm between chapters.
 */
export function Chapter({
  n,
  id,
  label,
  lead,
  aside,
  children,
  className,
}: {
  n: number;
  id: string;
  label: React.ReactNode;
  lead?: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24 py-[clamp(4.5rem,12vh,9rem)]", className)}>
      <div className="reveal mb-[clamp(1.8rem,4.5vh,2.8rem)] flex flex-wrap items-baseline justify-between gap-4">
        <div className="label">
          {String(n).padStart(2, "0")} — {label}
        </div>
        {aside}
      </div>
      {lead && (
        <p className="reveal mb-[clamp(3rem,8vh,5rem)] max-w-[20ch] font-serif text-[clamp(1.6rem,3.4vw,2.6rem)] leading-[1.18] font-light tracking-[-0.01em] [&_em]:italic" style={delay(80)}>
          {lead}
        </p>
      )}
      {children}
    </section>
  );
}

/** Editorial split: a quiet aside (label, figure, caption) beside the working column. Stacks on phones. */
export function Split({ aside, children, className, d }: { aside: React.ReactNode; children: React.ReactNode; className?: string; d?: number }) {
  return (
    <div className={cn("grid grid-cols-1 gap-x-[clamp(1.2rem,5vw,5rem)] gap-y-9 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]", className)}>
      <div className="reveal md:sticky md:top-24 md:self-start" style={delay(d)}>
        {aside}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** The aside: eyebrow → big light mono figure with a gold unit → caption. */
export function Aside({
  label,
  figure,
  unit,
  tone,
  caption,
  children,
}: {
  label: React.ReactNode;
  figure?: React.ReactNode;
  unit?: React.ReactNode;
  tone?: "pos" | null;
  caption?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      {figure !== undefined && (
        <div className={cn("num mt-5 text-[clamp(2.6rem,5.4vw,4.4rem)] leading-none font-light tracking-[-0.02em] transition-colors duration-700", tone === "pos" && "text-pos")}>
          {figure}
          {unit && <span className="ml-[0.3em] text-[0.36em] tracking-[0.04em] text-gold">{unit}</span>}
        </div>
      )}
      {caption && <div className="mt-4 font-mono text-[10px] leading-[1.6] tracking-[0.18em] text-ink-4 uppercase">{caption}</div>}
      {children}
    </div>
  );
}

/** Small letter-spaced group heading with an optional right-hand count. */
export function GroupHead({ children, right, className }: { children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-1 flex items-baseline justify-between gap-4 pb-3", className)}>
      <span className="font-mono text-[9.5px] tracking-[0.3em] text-ink-3 uppercase">{children}</span>
      {right !== undefined && <span className="num text-[11px] text-ink-4">{right}</span>}
    </div>
  );
}
