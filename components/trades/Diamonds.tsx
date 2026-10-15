import { cn } from "@/lib/cn";

/** Read-only execution rating: five ◆, the earned ones in gold. */
export function Diamonds({ value, className }: { value: number | null; className?: string }) {
  return (
    <span className={cn("inline-flex gap-[0.35em] text-[11px] leading-none", className)} aria-label={value ? `${value} of 5` : "Not rated"}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden className={(value ?? 0) >= n ? "text-gold" : "text-line-2"}>
          ◆
        </span>
      ))}
    </span>
  );
}
