import type { Trade } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * A day's tape in miniature for the log's day header: one hairline tick per
 * trade, in the order they were taken — gains rise in jade, losses fall in
 * cream. Scaled against the whole view so days compare honestly.
 */
export function DayTicks({ trades, max, className }: { trades: Trade[]; max: number; className?: string }) {
  const list = [...trades].sort((a, b) => a.entryTime.localeCompare(b.entryTime));
  return (
    <span aria-hidden className={cn("relative inline-flex h-[26px] items-stretch gap-[4px] px-1.5", className)}>
      <i className="absolute inset-x-0 top-1/2 block h-px bg-line-2" />
      {list.map((t) => {
        const m = Math.max(0.28, Math.sqrt(Math.abs(t.netPnl) / Math.max(1, max)));
        const up = t.netPnl >= 0;
        return (
          <span key={t.id} className="relative block w-px">
            <i className={cn("absolute left-0 block w-px", up ? "bottom-1/2 bg-pos" : "top-1/2 bg-neg/70")} style={{ height: `${m * 50}%` }} />
          </span>
        );
      })}
    </span>
  );
}
