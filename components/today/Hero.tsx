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
  const daily = stubs.find((s) => s.period === "daily");

  return (
    <section className="flex min-h-[calc(100svh-120px)] flex-col justify-center py-6">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="eyebrow">
          {dateLabel} · Day {dayNumber} · MMXXVI
        </div>
        {sync}
      </div>

      <RevealText as="h1" className="display max-w-[16ch] text-[clamp(42px,8.2vw,112px)]" delay={0.1}>
        {greeting}, <em>{name}</em>.
      </RevealText>

      <div className="my-10 sm:my-12">
        <LivingLine values={curve} height={150} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-8">
        <p className="max-w-[36ch] text-[12.5px] leading-[1.9] text-ink-2">
          {todayTrades
            ? `${todayTrades} trade${todayTrades === 1 ? "" : "s"} today, ${Math.round(todayWinRate * 100)}% won. `
            : "No trades yet today. Patience is a position. "}
          Week <span className={cn("num", weekNet >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(weekNet, { sign: true })}</span> · month{" "}
          <span className={cn("num", monthNet >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(monthNet, { sign: true })}</span>.
        </p>
        <div className="text-right max-sm:text-left">
          <Odometer value={todayNet} className="text-[clamp(30px,4vw,44px)] font-light" delay={300} />
          <div className="eyebrow mt-1.5">Today · net</div>
        </div>
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-x-7 gap-y-4">
        <Link href="/briefing/daily" data-magnetic="" className="inline-flex h-[52px] items-center border border-ink bg-ink px-8 font-mono text-[11px] tracking-[0.26em] text-bg uppercase transition-colors duration-300 hover:bg-transparent hover:text-ink">
          Play today&apos;s replay
        </Link>
        {stubs
          .filter((s) => s.period !== "daily" || !daily)
          .filter((s) => s.period !== "daily")
          .map((s) => (
            <Link key={s.period} href={`/briefing/${s.period}`} className="font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase transition-colors hover:text-ink">
              {!seen[s.id] && <span className="mr-1.5 text-gold">◆</span>}
              {PERIOD_LABEL[s.period]} replay {s.trades ? <span className={cn("num tracking-normal", s.net >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(s.net, { sign: true, compact: true })}</span> : null}
            </Link>
          ))}
        <a href="#thirty" className="font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase transition-colors hover:text-ink">↓ the last thirty days</a>
      </div>
    </section>
  );
}
