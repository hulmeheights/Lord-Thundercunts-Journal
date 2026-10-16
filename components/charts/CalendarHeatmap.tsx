import Link from "next/link";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import { addDays, endOfMonth, weekdayIndex, WEEKDAYS } from "@/lib/analytics/time";

export type CalendarDatum = { net: number; trades: number; journaled?: boolean };

/**
 * A month as hairline cells. Each traded day gets a thin vertical stem whose
 * height is the size of the day (jade up, cream down) and its net in mono;
 * a gold ◆ marks the days you wrote about. Each day opens its journal page.
 */
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
  const h = compact ? "h-12" : "h-[clamp(4.6rem,9vw,6.4rem)]";

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line pb-3">
        {WEEKDAYS.map((w) => (
          <div key={w} className="font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase">
            {compact ? w[0] : w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const edge = cn("border-b border-line", i % 7 !== 6 && "border-r");
          if (!day) return <div key={`e${i}`} className={cn(h, edge)} />;
          const d = data[day];
          const win = d && d.net > 0.004;
          const loss = d && d.net < -0.004;
          const isToday = day === today;
          const future = day > today;
          const stem = d ? Math.max(0.08, Math.abs(d.net) / max) : 0;
          const inner = (
            <div className={cn("group relative flex h-full flex-col justify-between p-2 transition-colors duration-300 sm:p-2.5", hrefFor && !future && "hover:bg-[rgba(236,231,221,0.025)]", future && "opacity-30")}>
              <div className="flex items-start justify-between">
                <span className={cn("num font-mono text-[10.5px] tracking-[0.08em]", isToday ? "text-ink" : d ? "text-ink-2" : "text-ink-4")}>
                  {String(Number(day.slice(8))).padStart(2, "0")}
                </span>
                {d?.journaled && <span className="font-mono text-[9px] leading-none text-gold">◆</span>}
              </div>
              {d && (
                <i
                  aria-hidden
                  data-private
                  className={cn("absolute bottom-2.5 left-2.5 block w-[2px] origin-bottom sm:left-3", win ? "bg-pos shadow-[0_0_8px_rgba(116,184,156,0.45)]" : loss ? "bg-neg" : "bg-ink-4")}
                  style={{ height: `${Math.round(stem * (compact ? 22 : 46))}%` }}
                />
              )}
              {d && !compact && (
                <div className={cn("num self-end truncate font-mono text-[10px] tracking-[0.02em] max-sm:hidden", win ? "text-pos" : loss ? "text-neg" : "text-ink-3")}>
                  {fmtMoney(d.net, { sign: true, compact: true })}
                </div>
              )}
              {isToday && <i aria-hidden className="absolute inset-x-0 top-0 block h-px bg-gold" />}
            </div>
          );
          return (
            <div key={day} className={cn(h, edge)}>
              {hrefFor && !future ? (
                <Link href={hrefFor(day)} className="block h-full" aria-label={`${day}${d ? `, ${fmtMoney(d.net, { sign: true })}` : ""}`}>
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

/**
 * The whole year as one strip of ticks, a column per week. Gains rise jade,
 * losses hang cream; their length is the size of the day. Written days get a
 * gold point beneath.
 */
export function YearStrip({ year, data, today, hrefFor }: { year: number; data: Record<string, CalendarDatum>; today: string; hrefFor?: (day: string) => string }) {
  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  const max = Math.max(1, ...days.map((d) => Math.abs(data[d]?.net ?? 0)));
  const months = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  return (
    <div>
      <div className="relative flex h-[120px] items-center gap-[1px] overflow-hidden" data-private role="img" aria-label={`P&L by day, ${year}`}>
        <i aria-hidden className="absolute inset-x-0 top-1/2 block h-px bg-line" />
        {days.map((d) => {
          const v = data[d];
          const len = v ? Math.max(4, (Math.abs(v.net) / max) * 52) : 0;
          const up = v ? v.net >= 0 : true;
          const tick = (
            <span className="relative block h-full w-full">
              {v && (
                <i
                  className={cn("absolute left-0 block w-full", up ? "bottom-1/2 bg-pos shadow-[0_0_6px_rgba(116,184,156,0.4)]" : "top-1/2 bg-neg")}
                  style={{ height: len }}
                />
              )}
              {v?.journaled && <i className="absolute bottom-0 left-0 block h-[2px] w-full bg-gold" />}
              {d === today && <i className="absolute top-0 left-0 block h-full w-full border-x border-gold/50" />}
            </span>
          );
          return (
            <span key={d} className={cn("h-full min-w-0 flex-1", d > today && "opacity-30")}>
              {hrefFor && v ? (
                <Link href={hrefFor(d)} className="block h-full" title={`${d} · ${fmtMoney(v.net, { sign: true })}`}>
                  {tick}
                </Link>
              ) : (
                tick
              )}
            </span>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-12 font-mono text-[9px] tracking-[0.3em] text-ink-4">
        {months.map((m, i) => (
          <span key={i}>{m}</span>
        ))}
      </div>
    </div>
  );
}
