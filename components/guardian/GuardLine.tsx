import { LiveChart, type ChartLevel, type ChartMark, type ChartTone } from "@/components/charts/LiveChart";
import type { PropStatus } from "@/lib/analytics/prop";
import type { PropSettings } from "@/lib/types";
import { fmtMoney } from "@/lib/format";
import { shortDay } from "./words";

/** One legend entry: a drawn sample of the stroke, then what it is in plain words. */
function Key({ kind, children }: { kind: "you" | "line" | "gap" | "target"; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3.5">
      <svg width="26" height="12" viewBox="0 0 26 12" className="mt-[0.45em] shrink-0" aria-hidden>
        {kind === "you" && <path d="M0 9 L8 6 L15 8 L26 2" fill="none" stroke="var(--pos)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
        {kind === "line" && <path d="M0 6 H26" fill="none" stroke="var(--ink-2)" strokeWidth="1" strokeDasharray="5 5" />}
        {kind === "gap" && <path d="M13 1 V11 M10 1 H16 M10 11 H16" fill="none" stroke="var(--ink-2)" strokeWidth="1" />}
        {kind === "target" && <path d="M0 6 H26" fill="none" stroke="var(--gold)" strokeWidth="1" strokeDasharray="2 4" />}
      </svg>
      <span>{children}</span>
    </li>
  );
}

/**
 * Guardian's line, drawn from the account itself: your balance close by close,
 * the max loss stepping up underneath it, and the gap between them measured
 * at the right-hand edge. Scrub it to read any day.
 */
export function GuardLine({ prop, st, compact = false }: { prop: PropSettings; st: PropStatus; compact?: boolean }) {
  // A crossed account ended on the day it crossed, so the line ends there too.
  const breachAt = st.breachDay ? st.path.findIndex((p) => p.day === st.breachDay) : -1;
  const path = breachAt > 0 ? st.path.slice(0, breachAt + 1) : st.path;
  const end = path.at(-1)!;
  const locked = end.floor >= prop.startBalance - 0.004;
  const tone: ChartTone = st.breached ? "ink" : st.cushionPct < 0.25 ? "gold" : "pos";
  const target = prop.profitTarget !== null ? prop.startBalance + (st.requiredProfit ?? prop.profitTarget) : null;

  const levels: ChartLevel[] = [{ value: prop.startBalance, label: compact ? undefined : `Start · ${fmtMoney(prop.startBalance)}` }];
  if (target !== null) levels.push({ value: target, label: `Target · ${fmtMoney(target)}`, tone: "gold", dashed: true });

  const marks: ChartMark[] = [];
  if (breachAt <= 0 && !compact) {
    // The close the line trails from. Today's close doesn't move it until the day is over.
    const bestAt = path.findIndex((p) => Math.abs(p.balance - st.highWater) < 0.005);
    if (bestAt > 0 && bestAt < path.length - 1) marks.push({ index: bestAt, label: "Best close", tone: "mute" });
  }

  return (
    <div>
      <LiveChart
        values={path.map((p) => p.balance)}
        floor={path.map((p) => p.floor)}
        levels={levels}
        marks={marks}
        ends={[
          { value: end.balance, label: `${breachAt > 0 ? "Closed" : "You"} ${fmtMoney(end.balance)}`, tone },
          { value: end.floor, label: `Max loss ${fmtMoney(end.floor)}` },
        ]}
        gap={fmtMoney(end.balance - end.floor)}
        readout={path.map((p, i) =>
          `${i === 0 ? "Start" : shortDay(p.day)} · balance ${fmtMoney(p.balance)} · max loss ${fmtMoney(p.floor)} · cushion ${fmtMoney(p.balance - p.floor)}`,
        )}
        tone={tone}
        gutter={150}
        height={compact ? 120 : 200}
        className={compact ? undefined : "max-sm:!h-[168px]"}
        label={`Balance ${fmtMoney(end.balance)}, max loss ${fmtMoney(end.floor)}, cushion ${fmtMoney(end.balance - end.floor)}.`}
      />
      {!compact && (
        <ul className="mt-6 grid max-w-4xl gap-x-12 gap-y-3 font-mono text-[11px] leading-[1.8] tracking-[0.03em] text-ink-3 sm:grid-cols-2">
          <Key kind="you">
            <span className="text-ink-2">Your balance</span>, one point for every day you traded.
          </Key>
          <Key kind="line">
            <span className="text-ink-2">The max loss.</span> It steps up after each new best close and never comes back down
            {locked ? <>. It has locked at {fmtMoney(prop.startBalance)}.</> : <>, until it locks at {fmtMoney(prop.startBalance)}.</>}
          </Key>
          <Key kind="gap">
            <span className="text-ink-2">The gap is your cushion</span>: what you can lose before the account is gone. A close on or under the dashed line ends it.
          </Key>
          {target !== null && (
            <Key kind="target">
              <span className="text-ink-2">The target.</span> Reach it and the evaluation is passed.
            </Key>
          )}
        </ul>
      )}
    </div>
  );
}
