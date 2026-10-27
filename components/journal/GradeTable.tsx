import { cn } from "@/lib/cn";
import { fmtMoney, fmtPct } from "@/lib/format";
import { gradeBreakdown } from "@/lib/analytics/grades";
import type { Trade } from "@/lib/types";

/** Your trades by the grade you gave them: does A+ pay, and what do the F ones cost? */
export function GradeTable({ trades, caption }: { trades: readonly Trade[]; caption: string }) {
  const { rows, graded, ungraded } = gradeBreakdown(trades);
  const f = rows.find((r) => r.grade === "F")!;
  const top = rows.filter((r) => r.grade === "A+" || r.grade === "A");
  const topNet = top.reduce((s, r) => s + r.net, 0);
  return (
    <div className="reveal">
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
        <span className="font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">By grade · {caption}</span>
        <span className="font-mono text-[10px] text-ink-4">{ungraded ? `${ungraded} ungraded` : graded ? "all graded" : ""}</span>
      </div>
      {graded === 0 ? (
        <p className="py-4 font-mono text-[11px] leading-[1.8] text-ink-3">No graded trades yet. Grade each one A+ to F on its day&apos;s page or the trade itself.</p>
      ) : (
        <>
          <ul>
            {rows.map((r) => (
              <li key={r.grade} className={cn("grid grid-cols-[2.5rem_1fr_auto_auto] items-baseline gap-x-4 border-b border-line py-2.5 font-mono text-[11.5px]", !r.trades && "opacity-40")}>
                <span className={cn("text-[13px]", r.grade === "F" || r.grade === "C" ? "text-neg" : "text-gold")}>{r.grade}</span>
                <span className="text-ink-3">
                  {r.trades} {r.trades === 1 ? "trade" : "trades"}
                  {r.winRate !== null && ` · ${fmtPct(r.winRate)} won`}
                </span>
                <span className="num text-[10.5px] text-ink-4">{r.avg !== null ? `${fmtMoney(r.avg, { sign: true })} avg` : ""}</span>
                <span className={cn("num w-20 text-right", r.net > 0 ? "text-pos" : r.net < 0 ? "text-neg" : "text-ink-3")}>{r.trades ? fmtMoney(r.net, { sign: true }) : "—"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[10.5px] leading-[1.8] text-ink-4">
            {f.trades
              ? `F trades ${f.net < 0 ? `cost you ${fmtMoney(-f.net)}` : `made ${fmtMoney(f.net)}, luck, not edge`}. `
              : ungraded
                ? "No F trades graded yet. "
                : "No F trades: nothing taken that shouldn't have been. "}
            {top.some((r) => r.trades) && `A+ and A together: ${fmtMoney(topNet, { sign: true })}.`}
          </p>
        </>
      )}
    </div>
  );
}
