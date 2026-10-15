"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LivingLine } from "@/components/charts/LivingLine";
import { Odometer } from "@/components/motion/Odometer";
import { RevealText } from "@/components/motion/RevealText";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import { seenKey, type Stub } from "./StoryRings";

const PERIOD_LABEL = { daily: "Today", weekly: "Week", monthly: "Month" } as const;
const delay = (d: number) => ({ "--d": `${d}ms` }) as React.CSSProperties;

function Money({ v }: { v: number }) {
  return <span className={cn("num text-ink", v > 0.004 && "text-pos", v < -0.004 && "text-neg")}>{fmtMoney(v, { sign: true })}</span>;
}

/**
 * Meridian's hero, made yours: date · day · year, the serif greeting, your real
 * equity curve as the living line, a mono read on the day beside the rolling
 * P&L, and the replay as the one ink button.
 */
export function TodayHero({
  dateLabel,
  dayNumber,
  greeting,
  name,
  curve,
  todayNet,
  todayTrades,
  todayWinRate,
  weekNet,
  monthNet,
  stubs,
  sync,
  closedAt = null,
}: {
  dateLabel: string;
  dayNumber: number;
  greeting: string;
  name: string;
  curve: number[];
  todayNet: number;
  todayTrades: number;
  todayWinRate: number;
  weekNet: number;
  monthNet: number;
  stubs: Stub[];
  sync: React.ReactNode;
  /** "HH:MM" once today's review is written. */
  closedAt?: string | null;
}) {
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const s: Record<string, boolean> = {};
    for (const st of stubs) {
      try {
        s[st.id] = localStorage.getItem(seenKey(st.id)) === st.hash;
      } catch {
        s[st.id] = false;
      }
    }
    setSeen(s);
  }, [stubs]);

  const wins = Math.round(todayWinRate * todayTrades);

  return (
    <section id="top" className="flex min-h-[calc(100svh-168px)] scroll-mt-24 flex-col justify-center pt-5 pb-12 lg:min-h-[calc(100svh-40px)] lg:pt-0 lg:pb-16">
      <div className="reveal mb-[clamp(1.6rem,4vh,2.8rem)] flex flex-col gap-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="eyebrow !tracking-[0.42em]">
          {dateLabel} · Day {dayNumber} · MMXXVI
        </div>
        {sync}
      </div>

      <RevealText as="h1" className="max-w-[16ch] font-serif text-[clamp(2.6rem,8.2vw,7rem)] leading-[1] font-light tracking-[-0.01em] [&_em]:italic" delay={0.1}>
        {greeting}, <em>{name}</em>.
      </RevealText>

      <div className="reveal my-[clamp(2.2rem,6vh,3.4rem)]" style={delay(200)}>
        <LivingLine values={curve} height={150} className="max-sm:!h-[110px]" />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-7 max-sm:flex-col max-sm:items-start">
        <p className="reveal max-w-[36ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2" style={delay(280)}>
          {todayTrades ? (
            <>
              {todayTrades} {todayTrades === 1 ? "trade" : "trades"} today, {wins} won.{" "}
            </>
          ) : (
            <>No trades yet today. Patience is a position. </>
          )}
          The week <Money v={weekNet} />, the month <Money v={monthNet} />.
        </p>
        <div className="reveal text-right max-sm:text-left" style={delay(340)}>
          <Odometer value={todayNet} className="text-[clamp(1.9rem,3.4vw,2.6rem)] leading-none font-light tracking-[0.01em]" delay={500} />
          <div className="mt-2.5 font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase">Today · net</div>
          {closedAt && (
            <div className="mt-1.5 font-mono text-[9px] tracking-[0.3em] text-ink-3 uppercase">
              Session closed <span className="text-gold">◆</span> {closedAt}
            </div>
          )}
        </div>
      </div>

      <div className="reveal mt-[clamp(2.4rem,6vh,3.6rem)] flex flex-wrap items-center gap-x-8 gap-y-6" style={delay(420)}>
        <Link
          href="/briefing/daily"
          data-magnetic=""
          className="inline-flex h-[52px] items-center border border-ink bg-ink px-8 font-mono text-[11px] tracking-[0.26em] text-bg uppercase transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-transparent hover:text-ink"
        >
          Play today&apos;s replay
        </Link>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
          {stubs
            .filter((s) => s.period !== "daily")
            .map((s) => (
              <Link
                key={s.period}
                href={`/briefing/${s.period}`}
                className="inline-flex items-baseline gap-2 font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase transition-colors duration-300 hover:text-ink"
              >
                <span className={cn("text-gold transition-opacity", seen[s.id] && "opacity-0")} aria-hidden>
                  ◆
                </span>
                {PERIOD_LABEL[s.period]}
                {s.trades ? (
                  <span className={cn("num text-[10.5px] tracking-normal", s.net > 0 ? "text-pos" : s.net < 0 ? "text-neg" : "text-ink-3")}>
                    {fmtMoney(s.net, { sign: true, compact: true })}
                  </span>
                ) : null}
              </Link>
            ))}
          <a href="#thirty" className="font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase transition-colors duration-300 hover:text-ink">
            ↓ the last thirty days
          </a>
        </div>
      </div>
    </section>
  );
}
