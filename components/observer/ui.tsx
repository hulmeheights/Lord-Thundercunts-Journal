import { cn } from "@/lib/cn";
import type { OrderVerdict, PerceptionGap } from "@/lib/analytics/observer";

/** A quiet letter-spaced text button with a hairline underline (Meridian's "Log in →"). */
export const textBtn =
  "inline-flex items-center gap-2 border-b border-line pb-1 font-mono text-[10px] tracking-[0.28em] text-ink-3 uppercase " +
  "transition-colors duration-300 hover:border-ink-4 hover:text-ink disabled:pointer-events-none disabled:opacity-40";

/** Mono body copy, Meridian's 12px / 1.9. */
export const monoBody = "font-mono text-[12px] leading-[1.9] tracking-[0.03em] text-ink-2";

/** Italicises every occurrence of `name` in a sentence — the third person is the point. */
export function Named({ text, name }: { text: string; name: string }) {
  if (!name) return <>{text}</>;
  const parts = text.split(new RegExp(`(${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "g"));
  return (
    <>
      {parts.map((p, i) => (p === name ? <em key={i}>{p}</em> : p))}
    </>
  );
}

/** Colours the signed amounts inside a sentence: +$ in jade, −$ in the loss tone. Everything else stays as written. */
export function Figures({ text }: { text: string }) {
  const parts = text.split(/([+−-]\$[\d,]+(?:\.\d+)?)/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <span key={i} className={cn("num whitespace-nowrap", p.startsWith("+") ? "text-pos" : "text-neg")}>
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** "When *Lord takes a loss*, hands off the mouse…" */
export function IfThen({ when, then, className }: { when: string; then: string; className?: string }) {
  return (
    <span className={className}>
      When <em>{when}</em>, {then}
    </span>
  );
}

export const GAP_COPY: Record<PerceptionGap["verdict"], { short: string; big: React.ReactNode }> = {
  aligned: {
    short: "Saw it clearly",
    big: (
      <>
        You see <em>clearly</em>.
      </>
    ),
  },
  partial: {
    short: "Half the picture",
    big: (
      <>
        Half the <em>picture</em>.
      </>
    ),
  },
  blind: {
    short: "A blind spot",
    big: (
      <>
        A <em>blind spot</em>.
      </>
    ),
  },
  unknown: {
    short: "Too early to tell",
    big: (
      <>
        Too <em>early</em> to tell.
      </>
    ),
  },
};

export const ORDER_COPY: Record<OrderVerdict, { label: string; glyph: string; tone: string }> = {
  kept: { label: "Kept", glyph: "◆", tone: "text-pos" },
  broken: { label: "Broken", glyph: "×", tone: "text-neg" },
  untested: { label: "Not tested yet", glyph: "", tone: "text-ink-3" },
  self: { label: "Yours to judge", glyph: "", tone: "text-ink-2" },
};

/** A six-pixel session mark: filled jade = kept, hollow cream ring = broken, a hairline dot = untested. */
export function SessionMark({ verdict, className }: { verdict: OrderVerdict; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block rounded-full",
        verdict === "kept" && "h-1.5 w-1.5 bg-pos",
        verdict === "broken" && "h-1.5 w-1.5 border border-neg",
        (verdict === "untested" || verdict === "self") && "h-[3px] w-[3px] bg-ink-4",
        className,
      )}
    />
  );
}
