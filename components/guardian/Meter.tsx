import { cn } from "@/lib/cn";

/**
 * A hairline progress line: a 1px track, a 2px fill that draws itself in when
 * its section reveals, and an optional gold tick for the rule's limit.
 */
export function Meter({
  value,
  mark,
  tone = "pos",
  label,
  className,
}: {
  value: number;
  mark?: number | null;
  tone?: "pos" | "neg" | "gold" | "ink";
  label?: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div
      data-private
      className={cn("reveal relative mt-5 h-[2px] w-full max-w-[15rem]", className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
    >
      <i className="absolute inset-x-0 top-1/2 block h-px -translate-y-1/2 bg-line-2" />
      <i
        className={cn(
          "absolute inset-y-0 left-0 block origin-left scale-x-0 transition-transform delay-300 duration-[1600ms] ease-[cubic-bezier(0.16,1,0.3,1)] [.in_&]:scale-x-100",
          tone === "pos" ? "bg-pos" : tone === "gold" ? "bg-gold" : tone === "neg" ? "bg-neg" : "bg-ink-2",
        )}
        style={{ width: `${v * 100}%` }}
      />
      {mark != null && <i className="absolute -top-[5px] block h-[12px] w-px bg-gold" style={{ left: `${Math.max(0, Math.min(1, mark)) * 100}%` }} />}
    </div>
  );
}
