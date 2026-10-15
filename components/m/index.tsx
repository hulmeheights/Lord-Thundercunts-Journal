import Link from "next/link";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";

export { Button as Btn, LinkButton as LinkBtn } from "@/components/ui/Button";

type D = { d?: number };
const delay = (d?: number) => (d ? ({ "--d": `${d}ms` } as React.CSSProperties) : undefined);

/** Page header: eyebrow → serif title (one <em>) → mono sub, with right-aligned meta like Meridian's HUD price. */
export function PageHead({
  eyebrow,
  title,
  sub,
  meta,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="pt-6 pb-[clamp(3rem,8vh,5.5rem)] sm:pt-10">
      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
        <div className="min-w-0 flex-1">
          {eyebrow && <div className="eyebrow reveal mb-[clamp(1.4rem,3.5vh,2.4rem)] !tracking-[0.42em]">{eyebrow}</div>}
          <h1 className="reveal max-w-[18ch] font-serif text-[clamp(2.6rem,7vw,6rem)] leading-[1] font-light tracking-[-0.01em] [&_em]:italic" style={delay(80)}>
            {title}
          </h1>
          {sub && (
            <p className="reveal mt-[clamp(1.4rem,3.5vh,2.2rem)] max-w-[44ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2" style={delay(160)}>
              {sub}
            </p>
          )}
        </div>
        {meta && (
          <div className="reveal shrink-0 text-right font-mono max-sm:text-left" style={delay(200)}>
            {meta}
          </div>
        )}
      </div>
      {children && (
        <div className="reveal mt-[clamp(2rem,5vh,3rem)] flex flex-wrap items-center gap-x-6 gap-y-4" style={delay(240)}>
          {children}
        </div>
      )}
    </header>
  );
}

/** Right-hand meta block: a big tabular figure over a letter-spaced caption. */
export function Meta({ value, caption, tone }: { value: React.ReactNode; caption: React.ReactNode; tone?: "pos" | "neg" | null }) {
  return (
    <div>
      <div className={cn("num text-[clamp(1.5rem,3vw,2.2rem)] font-light tracking-[0.01em]", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</div>
      <div className="mt-1.5 font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase">{caption}</div>
    </div>
  );
}

/** Gold "02 — The playbook" label. */
export function Label({ n, children, className }: { n?: string | number; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("label", className)}>
      {n !== undefined && <>{String(n).padStart(2, "0")} — </>}
      {children}
    </div>
  );
}

/** A serif statement under a section label. */
export function Lead({ children, className, ...d }: { children: React.ReactNode; className?: string } & D) {
  return (
    <p className={cn("reveal max-w-[20ch] font-serif text-[clamp(1.5rem,3.4vw,2.6rem)] leading-[1.2] font-light tracking-[-0.01em] [&_em]:italic", className)} style={delay(d.d)}>
      {children}
    </p>
  );
}

/** A numbered section: label → optional lead → content. Space, not boxes, separates sections. */
export function Section({
  n,
  label,
  lead,
  aside,
  id,
  children,
  className,
}: {
  n?: string | number;
  label: React.ReactNode;
  lead?: React.ReactNode;
  aside?: React.ReactNode;
  id?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24 py-[clamp(4rem,10vh,8rem)]", className)}>
      <div className="reveal mb-[clamp(2rem,5vh,3rem)] flex flex-wrap items-baseline justify-between gap-4">
        <Label n={n}>{label}</Label>
        {aside}
      </div>
      {lead && <Lead className="mb-[clamp(2.5rem,7vh,4.5rem)]">{lead}</Lead>}
      {children}
    </section>
  );
}

/** Meridian's row: gold index · serif title · mono description, under a hairline. */
export function Row({
  i,
  title,
  desc,
  right,
  href,
  className,
  children,
  ...d
}: {
  i?: React.ReactNode;
  title: React.ReactNode;
  desc?: React.ReactNode;
  right?: React.ReactNode;
  href?: string;
  className?: string;
  children?: React.ReactNode;
} & D) {
  const body = (
    <>
      <div className="grid grid-cols-1 items-baseline gap-x-[clamp(1.2rem,4vw,3.5rem)] gap-y-3 md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <div className="font-mono text-[11px] tracking-[0.1em] text-gold max-md:order-[-1]">{i}</div>
        <div className="font-serif text-[clamp(1.3rem,2.6vw,1.9rem)] leading-[1.2] font-normal tracking-[-0.01em] [&_em]:italic">{title}</div>
        <div className="font-mono text-[12px] leading-[1.9] tracking-[0.02em] text-ink-2">{desc}</div>
        {right !== undefined && <div className="font-mono text-[13px] md:text-right">{right}</div>}
      </div>
      {children}
    </>
  );
  const cls = cn("reveal m-row block border-t border-line py-[clamp(1.5rem,3.6vh,2.3rem)] last:border-b", className);
  return href ? (
    <Link href={href} className={cls} style={delay(d.d)}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={delay(d.d)}>
      {body}
    </div>
  );
}

export function Rows({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("[&>*:last-child]:border-b", className)}>{children}</div>;
}

/** Big light figure + letter-spaced caption (Meridian "What you get"). */
export function Stat({ value, label, unit, sub, tone, ...d }: { value: React.ReactNode; label: React.ReactNode; unit?: React.ReactNode; sub?: React.ReactNode; tone?: "pos" | "neg" | null } & D) {
  return (
    <div className="reveal min-w-0" style={delay(d.d)}>
      <div className={cn("num text-[clamp(2.2rem,5vw,4.2rem)] leading-none font-light tracking-[-0.02em]", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>
        {value}
        {unit && <span className="ml-[0.3em] text-[0.42em] tracking-[0.04em] text-gold">{unit}</span>}
      </div>
      <div className="mt-4 font-mono text-[10px] leading-[1.6] tracking-[0.18em] text-ink-4 uppercase">{label}</div>
      {sub && <div className="mt-1.5 font-mono text-[11px] leading-[1.7] text-ink-3">{sub}</div>}
    </div>
  );
}

export function Stats({ children, cols = 4, className }: { children: React.ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-[clamp(1.5rem,4vw,3rem)] gap-y-12 border-t border-line pt-[clamp(2rem,5vh,3rem)]",
        cols === 4 && "lg:grid-cols-4",
        cols === 3 && "lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Money with sign and tone: jade up, cream down (or clay if the owner opts in). */
export function Num({ value, sign = true, compact, cents, className, muted }: { value: number; sign?: boolean; compact?: boolean; cents?: boolean; className?: string; muted?: boolean }) {
  return (
    <span className={cn("num", !muted && value > 0.004 && "text-pos", !muted && value < -0.004 && "text-neg", className)}>
      {fmtMoney(value, { sign, compact, cents })}
    </span>
  );
}

/** The only boxed element. `gold` for the single featured panel on a page. */
export function Panel({ children, gold, className, ...d }: { children: React.ReactNode; gold?: boolean; className?: string } & D) {
  return (
    <div className={cn("reveal rounded-[3px] border bg-surface p-[clamp(1.6rem,3vw,2.6rem)]", gold ? "border-gold bg-[rgba(189,158,99,0.03)]" : "border-line", className)} style={delay(d.d)}>
      {children}
    </div>
  );
}

export function Tag({ children, tone, className }: { children: React.ReactNode; tone?: "pos" | "gold" | "neg"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center border px-2 font-mono text-[9.5px] tracking-[0.18em] whitespace-nowrap uppercase",
        tone === "pos" ? "border-pos/40 text-pos" : tone === "gold" ? "border-gold/50 text-gold" : tone === "neg" ? "border-line-2 text-neg" : "border-line text-ink-3",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Letter-spaced cue link ("↓ the playbook"). */
export function Cue({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase transition-colors duration-300 hover:text-ink", className)}>
      {children}
    </Link>
  );
}

/** Jade "● LIVE"-style status dot. */
export function Dot({ tone = "pos", pulse = true, className }: { tone?: "pos" | "gold" | "mute"; pulse?: boolean; className?: string }) {
  const c = tone === "pos" ? "bg-pos" : tone === "gold" ? "bg-gold" : "bg-ink-4";
  return (
    <span className={cn("relative inline-grid h-1.5 w-1.5 place-items-center align-middle", className)} aria-hidden>
      {pulse && <span className={cn("absolute h-1.5 w-1.5 animate-ping rounded-full opacity-50", c)} />}
      <span className={cn("h-1.5 w-1.5 rounded-full", c)} />
    </span>
  );
}

/** Serif italic quote with a letter-spaced citation. */
export function Quote({ children, cite, className }: { children: React.ReactNode; cite?: React.ReactNode; className?: string }) {
  return (
    <figure className={cn("reveal text-center", className)}>
      <blockquote className="mx-auto max-w-[24ch] font-serif text-[clamp(1.5rem,3.6vw,2.8rem)] leading-[1.35] font-light tracking-[-0.01em] italic">{children}</blockquote>
      {cite && <figcaption className="mt-8 font-mono text-[10px] tracking-[0.28em] text-ink-4 uppercase">— {cite}</figcaption>}
    </figure>
  );
}

export function Empty({ title, children, action, className }: { title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("reveal border-t border-line py-[clamp(3rem,8vh,5rem)]", className)}>
      <p className="max-w-[22ch] font-serif text-[clamp(1.4rem,3vw,2.2rem)] leading-[1.25] font-light [&_em]:italic">{title}</p>
      {children && <p className="mt-5 max-w-[44ch] font-mono text-[12px] leading-[1.9] text-ink-3">{children}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

/** Eyebrow-style field label wrapping an input. */
export function Field({ label, hint, children, className }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-2 block font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block font-mono text-[10.5px] leading-[1.7] text-ink-4">{hint}</span>}
    </label>
  );
}
