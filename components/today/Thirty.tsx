import Link from "next/link";
import { Stat, Stats } from "@/components/m";
import { Odometer } from "@/components/motion/Odometer";
import { shortDate } from "@/lib/analytics/time";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import { Vine, type ThreadDay } from "./Vine";
import { numberWord } from "./words";

export type ThirtyStats = {
  trades: number;
  winRate: number;
  winRatePrev: number | null;
  profitFactor: number;
  expectancy: number;
  avgR: number | null;
  bestSetup: { name: string; expectancy: number; trades: number } | null;
  streak: number;
  thread: ThreadDay[];
  cleanDays: number;
  tradingDays: number;
};

const fig = "font-light";

/** 01 — the last thirty days: four figures, the process vine, the setup that pays. */
export function Thirty({ s, today }: { s: ThirtyStats; today: string }) {
  const delta = s.winRatePrev === null ? null : Math.round((s.winRate - s.winRatePrev) * 100);
  const pf = Number.isFinite(s.profitFactor) ? s.profitFactor : null;
  const closed = s.thread.filter((d) => d.closed).length;
  const first = s.thread[0]?.day;

  const streakLine =
    s.streak === 0 ? (
      <>
        The thread starts <em>today</em>.
      </>
    ) : (
      <>
        {cap(numberWord(s.streak))} {s.streak === 1 ? "day" : "days"} <em>unbroken</em>.
      </>
    );

  return (
    <div>
      <Stats>
        <Stat
          value={<Odometer value={Math.round(s.winRate * 100)} format="number" sign={false} tone={false} className={fig} />}
          unit="%"
          label="Win rate"
          sub={
            delta === null ? (
              `${s.trades} trades`
            ) : (
              <>
                <span className={cn("num", delta > 0 && "text-pos", delta < 0 && "text-neg")}>
                  {delta > 0 ? "▲" : delta < 0 ? "▼" : "·"} {Math.abs(delta)} pts
                </span>{" "}
                vs the prior 30
              </>
            )
          }
        />
        <Stat
          d={80}
          value={pf === null ? "∞" : <Odometer value={pf} format="ratio" decimals={2} tone={false} className={fig} />}
          unit="×"
          label="Profit factor"
          sub={pf === null ? "No losing trades yet" : pf > 0 ? `${fmtMoney(pf, { cents: true })} won per $1 lost` : "Nothing won yet"}
        />
        {s.avgR !== null ? (
          <Stat
            d={160}
            value={<Odometer value={s.avgR} format="number" decimals={2} tone={false} className={fig} />}
            unit="R"
            tone={s.avgR > 0.004 ? "pos" : s.avgR < -0.004 ? "neg" : null}
            label="Average R"
            sub="Against your planned risk"
          />
        ) : (
          <Stat
            d={160}
            value={<Odometer value={s.expectancy} decimals={s.expectancy !== 0 && Math.abs(s.expectancy) < 100 ? 2 : 0} tone={false} className={fig} />}
            tone={s.expectancy > 0.004 ? "pos" : s.expectancy < -0.004 ? "neg" : null}
            label="Per trade"
            sub="Average net result"
          />
        )}
        <Stat
          d={240}
          value={<Odometer value={s.cleanDays} format="number" sign={false} tone={false} className={fig} />}
          unit={`/ ${s.tradingDays}`}
          label="Clean days"
          sub="Sessions inside every rule"
        />
      </Stats>

      <div className="mt-[clamp(4.5rem,11vh,7.5rem)]">
        <div className="reveal grid grid-cols-1 gap-x-[clamp(1.2rem,4vw,3.5rem)] gap-y-9 border-t border-line py-[clamp(2rem,5vh,3rem)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] md:items-center">
          <div>
            <div className="eyebrow mb-5">Process streak</div>
            <p className="font-serif text-[clamp(1.6rem,3.2vw,2.4rem)] leading-[1.12] font-light tracking-[-0.01em] [&_em]:italic">{streakLine}</p>
            <p className="mt-4 max-w-[38ch] font-mono text-[11px] leading-[1.85] tracking-[0.02em] text-ink-3">
              A leaf grows on every session you prepare, keep your rules and write the review.
            </p>
          </div>
          <div className="min-w-0">
            <Vine days={s.thread} today={today} />
            <div className="mt-2 flex items-baseline justify-between gap-4 font-mono text-[9px] tracking-[0.24em] text-ink-4 uppercase">
              <span>{first ? shortDate(first) : ""}</span>
              <span className="max-sm:hidden">
                {closed} of {s.thread.length} closed
              </span>
              <span>
                Today <span className="text-gold">◆</span>
              </span>
            </div>
          </div>
        </div>

        <div className="reveal grid grid-cols-1 gap-x-[clamp(1.2rem,4vw,3.5rem)] gap-y-6 border-y border-line py-[clamp(2rem,5vh,3rem)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] md:items-end" style={{ "--d": "80ms" } as React.CSSProperties}>
          <div>
            <div className="eyebrow mb-5">Best setup · 30 days</div>
            {s.bestSetup ? (
              <p className="font-serif text-[clamp(1.6rem,3.2vw,2.4rem)] leading-[1.12] font-light tracking-[-0.01em] [&_em]:italic">
                {s.bestSetup.expectancy > 0 ? (
                  <>
                    Your edge lives in the <em>{s.bestSetup.name}</em>.
                  </>
                ) : (
                  <>
                    Nothing has paid yet. <em>{s.bestSetup.name}</em> comes closest.
                  </>
                )}
              </p>
            ) : (
              <p className="font-serif text-[clamp(1.6rem,3.2vw,2.4rem)] leading-[1.12] font-light tracking-[-0.01em] [&_em]:italic">
                Your edge has no <em>name</em> yet.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <p className="max-w-[40ch] font-mono text-[12px] leading-[1.9] tracking-[0.02em] text-ink-2">
              {s.bestSetup ? (
                <>
                  <span className={cn("num", s.bestSetup.expectancy > 0 ? "text-pos" : "text-neg")}>{fmtMoney(s.bestSetup.expectancy, { sign: true })}</span> a trade across{" "}
                  {s.bestSetup.trades} trades. Take it when it&apos;s there — and only then.
                </>
              ) : (
                "Tag a setup on each trade and the one that pays you will surface here."
              )}
            </p>
            <Link href="/insights" className="font-mono text-[10px] tracking-[0.3em] whitespace-nowrap text-ink-4 uppercase transition-colors duration-300 hover:text-ink">
              Every setup →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
