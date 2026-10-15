"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Trade } from "@/lib/types";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import { dayKey, timeInTz } from "@/lib/analytics/time";
import { prefersReducedMotion } from "@/lib/motion";
import { dayLabel } from "./lib";

/**
 * The tape: one hairline tick per execution, oldest to newest. Gains rise in
 * jade above the midline, losses fall in cream below it. The ticks grow in
 * left to right whenever the range changes. Hover (or tap) reads a trade;
 * click opens it.
 */
export function Tape({ trades, tz, className }: { trades: Trade[]; tz: string; className?: string }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [shown, setShown] = useState(false);

  const { max, key } = useMemo(() => {
    let m = 1;
    let sum = 0;
    for (const t of trades) {
      m = Math.max(m, Math.abs(t.netPnl));
      sum += t.netPnl;
    }
    return { max: m, key: `${trades.length}:${trades[0]?.id ?? ""}:${trades.at(-1)?.id ?? ""}:${Math.round(sum)}` };
  }, [trades]);

  // Re-draw the ticks whenever the set of trades changes.
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(true);
      return;
    }
    setShown(false);
    let r2 = 0;
    const r1 = requestAnimationFrame(() => (r2 = requestAnimationFrame(() => setShown(true))));
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [key]);

  const n = trades.length;
  const at = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !n) return null;
    return Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left) / r.width) * n)));
  };
  const h = hover !== null ? trades[hover] : undefined;
  const first = trades[0];
  const last = trades.at(-1);
  const spread = Math.min(900, n * 14);

  return (
    <div className={className}>
      <div
        ref={box}
        className={cn("relative h-[96px] touch-pan-y select-none sm:h-[132px]", n > 0 && "cursor-pointer")}
        onPointerMove={(e) => e.pointerType === "mouse" && setHover(at(e.clientX))}
        onPointerDown={(e) => e.pointerType !== "mouse" && setHover(at(e.clientX))}
        onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
        onClick={(e) => {
          const i = at(e.clientX);
          if (i !== null && (e.nativeEvent as PointerEvent).pointerType === "mouse") router.push(`/trades/${encodeURIComponent(trades[i]!.id)}`);
        }}
        role="img"
        aria-label={`${n} trades, oldest to newest. Gains above the line, losses below.`}
      >
        <div className="absolute inset-x-0 top-1/2 h-px bg-line-2" />
        <div className="absolute inset-0 flex">
          {trades.map((t, i) => {
            const mag = Math.max(0.035, Math.sqrt(Math.abs(t.netPnl) / max));
            const up = t.netPnl >= 0;
            const on = hover === i;
            return (
              <div key={t.id} className="relative min-w-0 flex-1">
                <i
                  className={cn(
                    "absolute left-1/2 block w-[2px] max-w-full transition-colors duration-200",
                    up ? "bottom-1/2 origin-bottom" : "top-1/2 origin-top",
                    on ? "bg-gold" : up ? "bg-pos" : "bg-neg/60",
                    hover !== null && !on && "opacity-50",
                  )}
                  style={{
                    height: `${mag * 50}%`,
                    transform: `translateX(-50%) scaleY(${shown ? 1 : 0})`,
                    transition: shown ? `transform 1.1s var(--ease-m) ${Math.round((i / Math.max(1, n - 1)) * spread)}ms, background-color .2s, opacity .3s` : "none",
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex min-h-[1.6rem] items-baseline justify-between gap-4 font-mono text-[9.5px] tracking-[0.26em] text-ink-4 uppercase">
        {h ? (
          <>
            <span className="min-w-0 truncate">
              <span className="text-ink-2">{dayLabel(dayKey(h.exitTime, tz))}</span> · {timeInTz(h.entryTime, tz)} · <span className="text-ink">{h.root}</span> {h.direction} ×{h.qty}
            </span>
            <span className="flex shrink-0 items-baseline gap-4">
              <span className={cn("num text-[12px] tracking-normal", h.netPnl > 0 ? "text-pos" : h.netPnl < 0 ? "text-neg" : "text-ink-3")}>{fmtMoney(h.netPnl, { sign: true })}</span>
              <Link href={`/trades/${encodeURIComponent(h.id)}`} className="text-ink-3 transition-colors hover:text-ink [@media(hover:hover)]:hidden">
                Open →
              </Link>
            </span>
          </>
        ) : first && last ? (
          <>
            <span>← {dayLabel(dayKey(first.exitTime, tz))}</span>
            <span className="hidden sm:inline">Each tick is one trade</span>
            <span>{dayLabel(dayKey(last.exitTime, tz))} →</span>
          </>
        ) : (
          <span>Nothing on the tape</span>
        )}
      </div>
    </div>
  );
}
