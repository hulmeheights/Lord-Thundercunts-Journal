import Link from "next/link";
import { cn } from "@/lib/cn";
import { d } from "./Rise";

/*
 * The four kit pieces (components/m) that hard-code the global `.reveal`,
 * mirrored for the trades screens with the hydration-safe `.t-rv` instead
 * (see Rise.tsx for why). Markup and type are kept identical to the kit, so
 * the screens read as one system; switch back to the kit versions once the
 * root reveal observer defers its first scan until after hydration.
 */

type D = { d?: number };

/** A serif statement under a section label (kit `Lead`). */
export function Lead({ children, className, ...p }: { children: React.ReactNode; className?: string } & D) {
  return (
    <p className={cn("t-rv max-w-[20ch] font-serif text-[clamp(1.5rem,3.4vw,2.6rem)] leading-[1.2] font-light tracking-[-0.01em] [&_em]:italic", className)} style={d(p.d)}>
      {children}
    </p>
  );
}

/** Big light figure + letter-spaced caption (kit `Stat`). */
export function Stat({ value, label, unit, sub, tone, ...p }: { value: React.ReactNode; label: React.ReactNode; unit?: React.ReactNode; sub?: React.ReactNode; tone?: "pos" | "neg" | null } & D) {
  return (
    <div className="t-rv min-w-0" style={d(p.d)}>
      <div className={cn("num text-[clamp(2.2rem,5vw,4.2rem)] leading-none font-light tracking-[-0.02em]", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>
        {value}
        {unit && <span className="ml-[0.3em] text-[0.42em] tracking-[0.04em] text-gold">{unit}</span>}
      </div>
      <div className="mt-4 font-mono text-[10px] leading-[1.6] tracking-[0.18em] text-ink-4 uppercase">{label}</div>
      {sub && <div className="mt-1.5 font-mono text-[11px] leading-[1.7] text-ink-3">{sub}</div>}
    </div>
  );
}

/** Meridian's row: gold index · serif title · mono description, under a hairline (kit `Row`). */
export function Row({
  i,
  title,
  desc,
  right,
  href,
  className,
  children,
  ...p
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
  const cls = cn("t-rv m-row block border-t border-line py-[clamp(1.5rem,3.6vh,2.3rem)] last:border-b", className);
  return href ? (
    <Link href={href} className={cls} style={d(p.d)}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={d(p.d)}>
      {body}
    </div>
  );
}

/** A confident serif line for an empty view (kit `Empty`). */
export function Empty({ title, children, action, className }: { title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("t-rv border-t border-line py-[clamp(3rem,8vh,5rem)]", className)}>
      <p className="max-w-[22ch] font-serif text-[clamp(1.4rem,3vw,2.2rem)] leading-[1.25] font-light [&_em]:italic">{title}</p>
      {children && <p className="mt-5 max-w-[44ch] font-mono text-[12px] leading-[1.9] text-ink-3">{children}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}
