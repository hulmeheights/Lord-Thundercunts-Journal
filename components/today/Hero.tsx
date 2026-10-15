"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { EquityRibbon } from "@/components/charts/EquityRibbon";
import { Odometer } from "@/components/motion/Odometer";
import { RevealText } from "@/components/motion/RevealText";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import { seenKey, type Stub } from "./StoryRings";

const PERIOD_LABEL = { daily: "Today", weekly: "This week", monthly: "This month" } as const;

/** The stage: always a night set, so the ribbon can glow — even on paper. */
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

  return (
    <section className="stage relative isolate min-h-[560px] overflow-hidden rounded-[32px] border border-line sm:min-h-[600px]">
      {/* light falloff */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(90%_60%_at_70%_110%,rgba(14,122,79,0.35),transparent_60%),radial-gradient(60%_50%_at_10%_0%,rgba(61,220,151,0.07),transparent_70%)]" />
      <EquityRibbon values={curve} className="top-[42%]" drawDelay={0.6} />
      <div aria-hidden className="absolute inset-x-0 top-0 h-2/3 bg-gradient-to-b from-[#07110c] via-[#07110c]/70 to-transparent" />

      <div className="relative z-10 flex min-h-[560px] flex-col p-6 sm:min-h-[600px] sm:p-10">
        <div className="flex items-start justify-between gap-4">
          <div className="eyebrow">
            {dateLabel} <span className="mx-1.5 text-ink-4">/</span> Day {dayNumber}
          </div>
          {sync}
        </div>

        <RevealText as="h1" className="display mt-8 max-w-3xl text-[clamp(40px,6.4vw,84px)]" delay={0.15}>
          {greeting}, <span className="text-brand">{name}</span>.
        </RevealText>

        <div className="mt-8 sm:mt-10">
          <div className="eyebrow mb-2">Today · net of fees</div>
          <div className="num-display text-[clamp(64px,11vw,148px)] leading-[0.9] font-semibold">
            <Odometer value={todayNet} face="display" delay={350} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[13.5px] text-ink-2">
            <span>{todayTrades ? `${todayTrades} trade${todayTrades === 1 ? "" : "s"} · ${Math.round(todayWinRate * 100)}% won` : "No trades yet. Patience is a position."}</span>
            <span>
              Week <b className={cn("num font-medium", weekNet > 0 ? "text-pos" : weekNet < 0 ? "text-neg" : "text-ink")}>{fmtMoney(weekNet, { sign: true })}</b>
            </span>
            <span>
              Month <b className={cn("num font-medium", monthNet > 0 ? "text-pos" : monthNet < 0 ? "text-neg" : "text-ink")}>{fmtMoney(monthNet, { sign: true })}</b>
            </span>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap gap-2.5 pt-10">
          {stubs.map((s) => {
            const unseen = !seen[s.id];
            return (
              <Link
                key={s.period}
                href={`/briefing/${s.period}`}
                className="group inline-flex h-11 items-center gap-3 rounded-full border border-line-2 bg-[#07110c]/60 pr-4 pl-1.5 backdrop-blur-md transition-colors hover:border-[color-mix(in_oklab,var(--glow)_45%,transparent)]"
              >
                <span className={cn("grid h-8 w-8 place-items-center rounded-full transition-colors", unseen ? "bg-glow text-[#04100a]" : "bg-fill-3 text-ink")}>
                  <Play size={13} className="translate-x-px fill-current" />
                </span>
                <span className="text-[13.5px] font-medium">{PERIOD_LABEL[s.period]}</span>
                <span className={cn("num text-[12.5px]", s.trades ? (s.net >= 0 ? "text-pos" : "text-neg") : "text-ink-4")}>
                  {s.trades ? fmtMoney(s.net, { sign: true, compact: true }) : "rest"}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
