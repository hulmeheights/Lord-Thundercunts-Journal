"use client";

import { useEffect, useMemo, useState } from "react";
import { LiveChart } from "@/components/charts/LiveChart";
import { Seg } from "@/components/m/Seg";
import { addDays, shortDate } from "@/lib/analytics/time";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";

export type JourneyDay = { day: string; net: number; trades: number };
type Range = "30" | "90" | "all";
type Seen = { total: number; trades: number; last: string };

const RANGE_KEY = "ltj_journey_range";
const SEEN_KEY = "ltj_journey_seen";
const RANGES: { value: Range; label: string }[] = [
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
  { value: "all", label: "All" },
];

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows can refuse storage; the line still draws.
  }
}

/**
 * The journey: the whole record as one line, drawn from the first trade to
 * now. It remembers what you last saw, so after an import, a sync or a new
 * trade it arrives at the old tip and then draws what was added.
 */
export function Journey({ days, today, delay = 0, height = 180, className }: { days: JourneyDay[]; today: string; delay?: number; height?: number; className?: string }) {
  const [range, setRange] = useState<Range>("all");
  const [seen, setSeen] = useState<Seen | null>(null);
  const [ready, setReady] = useState(false);

  const total = days.reduce((s, d) => s + d.net, 0);
  const trades = days.reduce((s, d) => s + d.trades, 0);
  const last = days.at(-1)?.day ?? "";

  useEffect(() => {
    const r = read<Range>(RANGE_KEY);
    if (r === "30" || r === "90" || r === "all") setRange(r);
    setSeen(read<Seen>(SEEN_KEY));
    setReady(true);
  }, []);

  const view = useMemo(() => {
    const cut = range === "all" ? "" : addDays(today, -(Number(range) - 1));
    const shown = days.filter((d) => d.day >= cut);
    let cum = 0;
    const values = [0, ...shown.map((d) => (cum += d.net))];
    const peak = Math.max(...values);
    const peakAt = values.indexOf(peak);
    return {
      shown,
      values,
      peak,
      peakAt,
      headLabels: values.map((v) => fmtMoney(v, { sign: true })),
      readout: values.map((v, i) =>
        i === 0 ? `Start · ${fmtMoney(0)}` : `${shortDate(shown[i - 1]!.day)} · ${fmtMoney(v, { sign: true })} · day ${fmtMoney(shown[i - 1]!.net, { sign: true })}`,
      ),
    };
  }, [days, range, today]);

  const net = view.values.at(-1) ?? 0;
  const grew = seen && (Math.abs(seen.total - total) > 0.004 || seen.trades !== trades) ? { money: total - seen.total, trades: trades - seen.trades } : null;
  // Where the last look ended, on the line that's showing.
  let seenIndex: number | undefined;
  if (grew && seen) {
    const i = view.shown.findLastIndex((d) => d.day <= seen.last) + 1;
    seenIndex = Math.min(i, view.values.length - 2);
  }
  const offHigh = view.peak - net;

  return (
    <div className={className}>
      <div style={{ height }} className="max-sm:!h-[132px]">
        {ready && (
          <LiveChart
            values={view.values}
            headLabels={view.headLabels}
            readout={view.readout}
            marks={[
              ...(view.peakAt > 0 && view.peakAt < view.values.length - 1 && view.values.length > 4 ? [{ index: view.peakAt, label: `High ${fmtMoney(view.peak, { sign: true })}`, tone: "mute" as const }] : []),
              ...(seenIndex !== undefined && seenIndex > 0 ? [{ index: seenIndex, label: "Last look", tone: "gold" as const }] : []),
            ]}
            levels={[{ value: 0 }]}
            seenIndex={seenIndex}
            delay={delay}
            height={height}
            className="max-sm:!h-[132px]"
            label={`Your record: ${fmtMoney(net, { sign: true })} across ${view.shown.length} sessions.`}
            onDone={() => write(SEEN_KEY, { total, trades, last } satisfies Seen)}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <Seg
          options={RANGES}
          value={range}
          onChange={(v) => {
            setRange(v);
            write(RANGE_KEY, v);
          }}
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase">
          {grew && (
            <span className="text-ink-2">
              <span className="text-gold">◆</span>{" "}
              <span className={cn("num tracking-[0.12em]", grew.money > 0.004 ? "text-pos" : "text-neg")}>{fmtMoney(grew.money, { sign: true })}</span> since your last look
              {grew.trades > 0 && (
                <>
                  {" "}
                  · {grew.trades} new {grew.trades === 1 ? "trade" : "trades"}
                </>
              )}
            </span>
          )}
          {view.shown.length > 0 ? (
            <span>
              Since {shortDate(view.shown[0]!.day)} · {view.shown.length} {view.shown.length === 1 ? "session" : "sessions"} ·{" "}
              {offHigh < 0.5 && net > 0 ? (
                <span className="text-gold">at the high</span>
              ) : (
                <>
                  <span className="num tracking-[0.12em] text-ink-3">{fmtMoney(offHigh)}</span> off the high
                </>
              )}
            </span>
          ) : (
            <span>The line starts with your first trade</span>
          )}
        </div>
      </div>
    </div>
  );
}
