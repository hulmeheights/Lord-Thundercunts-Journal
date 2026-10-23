import type { Trade } from "@/lib/types";
import { riskFor } from "@/lib/analytics/stats";
import { cn } from "@/lib/cn";
import { fmtNum, fmtPrice } from "@/lib/format";
import { fmtHold, holdMinutes, timeInTz } from "@/lib/analytics/time";
import { pointsFor } from "./lib";

type T = Pick<Trade, "direction" | "entryPrice" | "exitPrice" | "entryTime" | "exitTime" | "qty" | "pointValue" | "plannedRisk" | "netPnl">;

/**
 * Entry → exit, drawn as a schematic: hairline price levels, a jade entry
 * tick, a cream exit, the planned 1R risk as a dotted rule. The path draws
 * itself in once an ancestor gets `.t-drawn`. Server-renderable.
 */
export function PriceTrace({ trade, tz, defaultRisk = null, compact = false, className }: { trade: T; tz: string; defaultRisk?: number | null; compact?: boolean; className?: string }) {
  const { entryPrice: inP, exitPrice: outP } = trade;
  const long = trade.direction === "long";
  const win = trade.netPnl > 0.004;
  const loss = trade.netPnl < -0.004;
  const risk = riskFor(trade, defaultRisk);
  const stopPts = risk && trade.qty > 0 && trade.pointValue > 0 ? risk / (trade.qty * trade.pointValue) : null;
  const stop = !compact && stopPts ? (long ? inP - stopPts : inP + stopPts) : null;

  const levels = [inP, outP, ...(stop !== null ? [stop] : [])];
  const lo = Math.min(...levels);
  const hi = Math.max(...levels);
  const span = hi - lo || Math.max(Math.abs(inP) * 0.0004, 0.25);
  const pad = span * (compact ? 0.45 : 0.42);
  const top = hi + pad;
  const bot = lo - pad;
  const y = (p: number) => ((top - p) / (top - bot)) * 100;

  const xIn = compact ? 10 : 9;
  const xOut = compact ? 90 : 91;
  const yIn = y(inP);
  const yOut = y(outP);
  const rising = outP >= inP;
  const pts = pointsFor(trade);
  const tone = win ? "var(--pos)" : loss ? "var(--neg)" : "var(--ink-3)";

  const label = "absolute font-mono text-[9.5px] leading-none tracking-[0.22em] whitespace-nowrap uppercase";

  return (
    <div className={cn("relative w-full", compact ? "h-[132px]" : "h-[clamp(240px,34vw,400px)]", className)}>
      {/* plot */}
      <div className={cn("absolute inset-x-0 top-0", compact ? "bottom-7" : "bottom-11")}>
        <svg data-private viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <line x1="0" x2="100" y1={yIn} y2={yIn} stroke="var(--line-2)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2="100" y1={yOut} y2={yOut} stroke="var(--line-2)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
          {stop !== null && <line x1="0" x2="100" y1={y(stop)} y2={y(stop)} stroke="var(--ink-4)" strokeDasharray="1 6" vectorEffect="non-scaling-stroke" />}
        </svg>

        {/* the move: band + line, revealed left → right */}
        <div className="absolute inset-0 [clip-path:inset(0_100%_0_0)] transition-[clip-path] delay-300 duration-[1600ms] ease-[cubic-bezier(0.16,1,0.3,1)] [.t-drawn_&]:[clip-path:inset(0_0_0_0)]">
          <svg data-private viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            <rect x={xIn} width={xOut - xIn} y={Math.min(yIn, yOut)} height={Math.max(Math.abs(yOut - yIn), 0.01)} fill={tone} opacity={win ? 0.07 : 0.04} />
            <line x1={xIn} y1={yIn} x2={xOut} y2={yOut} stroke={tone} strokeWidth="7" opacity="0.14" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <line x1={xIn} y1={yIn} x2={xOut} y2={yOut} stroke={tone} strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>

        {/* drop lines to the time axis */}
        <i className="absolute bottom-0 block w-px bg-pos/35" style={{ left: `${xIn}%`, top: `${yIn}%` }} />
        <i className="absolute bottom-0 block w-px bg-ink/25 opacity-0 transition-opacity delay-[1500ms] duration-700 [.t-drawn_&]:opacity-100" style={{ left: `${xOut}%`, top: `${yOut}%` }} />

        {/* entry: a jade tick across the level */}
        <i className={cn("absolute block h-[2px] -translate-x-1/2 -translate-y-1/2 bg-pos", compact ? "w-3" : "w-[22px]")} style={{ left: `${xIn}%`, top: `${yIn}%` }} />
        {/* exit: a cream tick, struck once the line arrives */}
        <i
          className={cn(
            "absolute block h-[2px] -translate-x-1/2 -translate-y-1/2 scale-x-0 bg-ink transition-transform delay-[1650ms] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] [.t-drawn_&]:scale-x-100",
            compact ? "w-3" : "w-[22px]",
          )}
          style={{ left: `${xOut}%`, top: `${yOut}%` }}
        />

        {/* labels sit on the side away from the path */}
        <span className={cn(label, "text-pos")} style={{ left: `${xIn}%`, top: `${yIn}%`, transform: `translate(${compact ? "-30%" : "-20%"}, ${rising ? "14px" : "calc(-100% - 14px)"})` }}>
          In <span className="num ml-1.5 text-[11px] tracking-normal">{fmtPrice(inP)}</span>
        </span>
        <span
          className={cn(label, "text-ink opacity-0 transition-opacity delay-[1600ms] duration-700 [.t-drawn_&]:opacity-100")}
          style={{ left: `${xOut}%`, top: `${yOut}%`, transform: `translate(${compact ? "-70%" : "-80%"}, ${rising ? "calc(-100% - 14px)" : "14px"})` }}
        >
          Out <span className="num ml-1.5 text-[11px] tracking-normal">{fmtPrice(outP)}</span>
        </span>
        {!compact && (
          <span
            className={cn(label, "text-ink-3 opacity-0 transition-opacity delay-[1100ms] duration-700 [.t-drawn_&]:opacity-100")}
            style={{ left: "50%", top: `${(yIn + yOut) / 2}%`, transform: `translate(-50%, ${rising ? "18px" : "calc(-100% - 18px)"})` }}
          >
            <span className="num text-[11px] tracking-normal">
              {pts > 0 ? "+" : pts < 0 ? "−" : ""}
              {fmtNum(Math.abs(pts), 2)}
            </span>{" "}
            pts
          </span>
        )}
        {stop !== null && (
          <span className={cn(label, "left-0 text-ink-4")} style={{ top: `${y(stop)}%`, transform: long ? "translateY(8px)" : "translateY(calc(-100% - 8px))" }}>
            −1R <span className="num ml-1.5 text-[10.5px] tracking-normal">{fmtPrice(stop)}</span>
          </span>
        )}
      </div>

      {/* time axis */}
      <div className={cn("absolute inset-x-0 bottom-0 border-t border-line", compact ? "h-7" : "h-11")}>
        <span className={cn(label, "text-ink-3", compact ? "top-2.5" : "top-4")} style={{ left: `${xIn}%`, transform: "translateX(-50%)" }}>
          {timeInTz(trade.entryTime, tz)}
        </span>
        {!compact && (
          <span className={cn(label, "top-4 left-1/2 -translate-x-1/2 text-ink-4")}>{fmtHold(holdMinutes(trade.entryTime, trade.exitTime))} held</span>
        )}
        <span className={cn(label, "text-ink-3", compact ? "top-2.5" : "top-4")} style={{ left: `${xOut}%`, transform: "translateX(-50%)" }}>
          {timeInTz(trade.exitTime, tz)}
        </span>
      </div>
    </div>
  );
}
