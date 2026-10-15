import Link from "next/link";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import { addDays, endOfMonth, weekdayIndex, WEEKDAYS } from "@/lib/analytics/time";

export type CalendarDatum = { net: number; trades: number; journaled?: boolean };

/** A month of P&L as a heatmap. Each day links to its journal page. */
export function CalendarHeatmap({
  month,
  data,
  today,
  hrefFor,
  compact = false,
}: {
  month: string; // YYYY-MM-01
  data: Record<string, CalendarDatum>;
  today: string;
  hrefFor?: (day: string) => string;
  compact?: boolean;
}) {
  const first = month;
  const last = endOfMonth(month);
  const lead = weekdayIndex(first);
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const max = Math.max(1, ...Object.entries(data).filter(([d]) => d >= first && d <= last).map(([, v]) => Math.abs(v.net)));

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[10.5px] font-semibold tracking-wider text-ink-4 uppercase">
            {compact ? w[0] : w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} className={compact ? "aspect-square" : "aspect-[1/0.92]"} />;
          const d = data[day];
          const intensity = d ? Math.min(1, 0.18 + (Math.abs(d.net) / max) * 0.72) : 0;
          const bg = d ? (d.net >= 0 ? `rgba(48,209,88,${intensity * 0.55})` : `rgba(255,69,58,${intensity * 0.55})`) : undefined;
          const isToday = day === today;
          const future = day > today;
          const inner = (
            <div
              className={cn(
                "relative flex h-full flex-col justify-between rounded-xl border p-1.5 transition-transform sm:p-2",
                d ? "border-white/[0.06]" : "border-line bg-fill",
                isToday && "ring-1 ring-cyan/70",
                future && "opacity-35",
                hrefFor && !future && "hover:scale-[1.04] active:scale-[0.98]",
              )}
              style={{ background: bg }}
            >
              <div className="flex items-center justify-between">
                <span className={cn("text-[11px] font-semibold", d ? "text-white/90" : "text-ink-3")}>{Number(day.slice(8))}</span>
                {d?.journaled && <span className="h-1.5 w-1.5 rounded-full bg-cyan" />}
              </div>
              {d && !compact && (
                <div className="num truncate text-[11px] font-semibold text-white sm:text-[12px]">{fmtMoney(d.net, { sign: true, compact: true })}</div>
              )}
            </div>
          );
          return (
            <div key={day} className={compact ? "aspect-square" : "aspect-[1/0.92]"}>
              {hrefFor && !future ? (
                <Link href={hrefFor(day)} className="block h-full" aria-label={day}>
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
