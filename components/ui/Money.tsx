import { cn } from "@/lib/cn";
import { fmtMoney, pnlTone } from "@/lib/format";

export function Money({
  value,
  sign = true,
  className,
  compact,
  muted = false,
}: {
  value: number;
  sign?: boolean;
  className?: string;
  compact?: boolean;
  muted?: boolean;
}) {
  const tone = pnlTone(value);
  return (
    <span className={cn("num", !muted && tone === "pos" && "text-pos", !muted && tone === "neg" && "text-neg", tone === "flat" && "text-ink-2", className)}>
      {fmtMoney(value, { sign, compact })}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[12px] font-medium text-ink-3">{label}</div>
      <div className="num mt-1 truncate text-[22px] font-semibold tracking-[-0.02em]">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}
