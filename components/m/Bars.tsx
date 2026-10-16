import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";

export type BarDatum = { label: string; value: number; sub?: string };

/** Thin horizontal bars: label · hairline bar (jade gain / cream loss) · value. Mono, tabular. */
export function Bars({ data, format = (v: number) => fmtMoney(v, { sign: true }), className }: { data: BarDatum[]; format?: (v: number) => string; className?: string }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div className={cn("divide-y divide-line border-y border-line", className)}>
      {data.map((d, i) => (
        <div key={d.label} className="reveal grid grid-cols-[minmax(4.5rem,14rem)_1fr_auto] items-center gap-4 py-3" style={{ "--d": `${i * 40}ms` } as React.CSSProperties}>
          <div className="truncate font-mono text-[10.5px] tracking-[0.14em] text-ink-3 uppercase">{d.label}</div>
          <div className="relative h-[2px] bg-line">
            <i
              className={cn("absolute top-0 block h-[2px]", d.value >= 0 ? "bg-pos shadow-[0_0_8px_rgba(116,184,156,0.5)]" : "bg-neg")}
              style={{ width: `${(Math.abs(d.value) / max) * 100}%` }}
            />
          </div>
          <div className="text-right">
            <span className={cn("num text-[12.5px]", d.value > 0 ? "text-pos" : d.value < 0 ? "text-neg" : "text-ink-3")}>{format(d.value)}</span>
            {d.sub && <span className="ml-3 hidden font-mono text-[10px] text-ink-4 sm:inline">{d.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
