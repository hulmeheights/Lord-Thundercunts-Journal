import Link from "next/link";
import { LivingLine } from "@/components/charts/LivingLine";
import { Odometer } from "@/components/motion/Odometer";
import { RevealText } from "@/components/motion/RevealText";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import { HeroCues } from "./HeroCues";
import type { Stub } from "./StoryRings";

/**
 * The hero is on screen before the page hydrates, so it can't use the global
 * `.reveal` observer (it would add `.in` to server HTML before React checks it).
 * It rises in with a CSS keyframe instead: same distance, same easing.
 */
const RISE = "motion-safe:animate-[ltj-rise_1.1s_cubic-bezier(0.16,1,0.3,1)_both]";
const KEYFRAMES = "@keyframes ltj-rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}";

function Money({ v }: { v: number }) {
  return <span className={cn("num whitespace-nowrap text-ink", v > 0.004 && "text-pos", v < -0.004 && "text-neg")}>{fmtMoney(v, { sign: true })}</span>;
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
  intro = false,
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
  /** The opening sequence is playing: hold the entrance until it lifts. */
  intro?: boolean;
}) {
  const base = intro ? 2000 : 0;
  const at = (d: number) => ({ animationDelay: `${base + d}ms` }) as React.CSSProperties;
  const wins = Math.round(todayWinRate * todayTrades);

  return (
    <section
      id="top"
      className="flex min-h-[calc(100svh-150px)] scroll-mt-24 flex-col justify-center pt-4 pb-10 lg:min-h-[calc(100svh-40px)] lg:pt-0 lg:pb-16"
    >
      <style>{KEYFRAMES}</style>

      <div className={cn(RISE, "mb-[clamp(1.5rem,4vh,2.8rem)] flex flex-col gap-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6")} style={at(0)}>
        <div className="eyebrow !tracking-[0.42em]">
          <span>{dateLabel}</span>
          <span className="max-sm:hidden"> · </span>
          <span className="max-sm:mt-1 max-sm:block">
            Day {dayNumber} · MMXXVI
          </span>
        </div>
        {sync}
      </div>

      <RevealText as="h1" className="max-w-[16ch] font-serif text-[clamp(2.6rem,8.2vw,7rem)] leading-[1] font-light tracking-[-0.01em] [&_em]:italic" delay={0.1 + base / 1000}>
        {greeting}, <span className="whitespace-nowrap">
          <em>{name}</em>.
        </span>
      </RevealText>

      <div className={cn(RISE, "my-[clamp(1.8rem,5.5vh,3.4rem)]")} style={at(200)}>
        <LivingLine values={curve} height={150} className="max-sm:!h-[104px]" />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 max-sm:flex-col max-sm:items-start">
        <p className={cn(RISE, "max-w-[36ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2")} style={at(280)}>
          {todayTrades ? (
            <>
              {todayTrades} {todayTrades === 1 ? "trade" : "trades"} today, {wins} won.{" "}
            </>
          ) : (
            <>No trades yet today. Patience is a position. </>
          )}
          The week <Money v={weekNet} />, the month <Money v={monthNet} />.
        </p>
        <div className={cn(RISE, "text-right max-sm:text-left")} style={at(340)}>
          <Odometer value={todayNet} className="text-[clamp(1.9rem,3.4vw,2.6rem)] leading-none font-light tracking-[0.01em]" delay={base + 500} />
          <div className="mt-2.5 font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase">Today · net</div>
          {closedAt && (
            <div className="mt-2 font-mono text-[9px] tracking-[0.3em] text-ink-3 uppercase">
              Session closed <span className="text-gold">◆</span> <span className="num tracking-[0.12em] text-ink-2">{closedAt}</span>
            </div>
          )}
        </div>
      </div>

      <div className={cn(RISE, "mt-[clamp(2rem,5.5vh,3.6rem)] flex flex-wrap items-center gap-x-8 gap-y-5")} style={at(420)}>
        <Link
          href="/briefing/daily"
          data-magnetic=""
          className="inline-flex h-[52px] items-center border border-ink bg-ink px-8 font-mono text-[11px] tracking-[0.26em] text-bg uppercase transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-transparent hover:text-ink"
        >
          Play today&apos;s replay
        </Link>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
          <HeroCues stubs={stubs} />
          <a href="#thirty" className="font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase transition-colors duration-300 hover:text-ink">
            ↓ the last thirty days
          </a>
        </div>
      </div>
    </section>
  );
}
