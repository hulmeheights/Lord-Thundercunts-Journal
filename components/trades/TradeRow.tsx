"use client";

import Link from "next/link";
import { useState } from "react";
import type { Trade } from "@/lib/types";
import { cn } from "@/lib/cn";
import { fmtMoney, fmtNum, fmtPrice } from "@/lib/format";
import { fmtHold, holdMinutes, timeInTz } from "@/lib/analytics/time";
import { rMultiple } from "@/lib/analytics/stats";
import { LinkBtn, Num, Tag } from "@/components/m";
import { Diamonds } from "./Diamonds";
import { PriceTrace } from "./PriceTrace";
import { chartImage, RATING_WORDS } from "./lib";

/**
 * One execution in the log: a thin edge tick (jade win / cream loss), the
 * time, a prominent symbol, side, prices, hold, setup and net. Click to open
 * a preview of what you wrote; the arrow opens the trade itself.
 */
export function TradeRow({ t, tz, open, onToggle, defaultRisk }: { t: Trade; tz: string; open: boolean; onToggle: () => void; defaultRisk: number | null }) {
  const href = `/trades/${encodeURIComponent(t.id)}`;
  const win = t.netPnl > 0.004;
  const loss = t.netPnl < -0.004;
  const hold = fmtHold(holdMinutes(t.entryTime, t.exitTime));
  const time = timeInTz(t.entryTime, tz);
  const prices = (
    <>
      {fmtPrice(t.entryPrice)} <span className="text-ink-4">→</span> {fmtPrice(t.exitPrice)}
    </>
  );
  const setups = t.setups.length ? t.setups.join(" + ") : null;
  const mistakes = t.mistakes.length ? `${t.mistakes.length} mistake${t.mistakes.length === 1 ? "" : "s"}` : null;
  // The preview is only built the first time it opens (and kept after), so a
  // long log stays light and the trace draws in when you open it.
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);

  return (
    <div data-flip-id={t.id} className="border-b border-line">
      <div className="relative flex items-stretch">
        <i
          aria-hidden
          className={cn(
            "absolute top-[1.2rem] left-0 block h-[2.55rem] w-[2px] transition-colors duration-500 md:top-1/2 md:h-[1.15rem] md:-translate-y-1/2",
            open ? "bg-gold" : win ? "bg-pos" : loss ? "bg-neg/70" : "bg-ink-4",
          )}
        />
        <button type="button" onClick={onToggle} aria-expanded={open} className="group m-row min-w-0 flex-1 py-[1.15rem] text-left md:py-[1.2rem]">
          {/* phone: a two- (or three-) line composition */}
          <div className="pl-5 md:hidden">
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex min-w-0 items-baseline gap-3">
                <span className="font-mono text-[15px] tracking-[0.08em] text-ink">{t.root}</span>
                <span className="font-mono text-[9.5px] tracking-[0.22em] whitespace-nowrap text-ink-3 uppercase">
                  {t.direction} ×{t.qty}
                </span>
              </div>
              <Num value={t.netPnl} className="text-[15px]" />
            </div>
            <div className="num mt-1.5 flex items-baseline justify-between gap-3 text-[11px] text-ink-4">
              <span className="truncate">
                {time} <span className="mx-1">·</span> <span className="text-ink-3">{prices}</span>
              </span>
              <span className="shrink-0">{hold}</span>
            </div>
            {(setups || mistakes || t.notes) && (
              <div className="mt-2.5 flex min-w-0 items-baseline gap-2 font-mono text-[9px] tracking-[0.24em] text-ink-4 uppercase">
                {setups && <span className="truncate">{setups}</span>}
                {setups && mistakes && <span aria-hidden>·</span>}
                {mistakes && <span className="shrink-0 text-neg">{mistakes}</span>}
                {t.notes && (
                  <span className="shrink-0 font-serif text-[13px] tracking-normal normal-case italic" title="Has notes">
                    ¶
                  </span>
                )}
              </div>
            )}
          </div>

          {/* desktop: an editorial row */}
          <div className="hidden items-baseline gap-x-6 pl-5 md:grid md:grid-cols-[3rem_4.4rem_5.4rem_minmax(0,1fr)_3rem_7rem] xl:grid-cols-[3rem_4.6rem_5.6rem_minmax(11.5rem,13.5rem)_3rem_minmax(0,1fr)_7.5rem]">
            <span className="num text-[11.5px] text-ink-4">{time}</span>
            <span className="font-mono text-[15px] tracking-[0.08em] text-ink" title={t.symbol}>
              {t.root}
            </span>
            <span className="font-mono text-[9.5px] tracking-[0.22em] whitespace-nowrap text-ink-3 uppercase">
              {t.direction} ×{t.qty}
            </span>
            <span className="num truncate text-[12px] text-ink-2">{prices}</span>
            <span className="num text-[11.5px] text-ink-4">{hold}</span>
            <span className="hidden min-w-0 items-center gap-3 xl:flex">
              {setups && (
                <Tag className="max-w-full min-w-0">
                  <span className="truncate" title={setups}>{setups}</span>
                </Tag>
              )}
              {mistakes && (
                <span className="shrink-0 font-mono text-[9.5px] tracking-[0.2em] whitespace-nowrap text-neg uppercase" title={t.mistakes.join(" · ")}>
                  × {mistakes}
                </span>
              )}
              {t.notes && (
                <span className="shrink-0 font-serif text-[15px] text-ink-4 italic" title="Has notes">
                  ¶
                </span>
              )}
            </span>
            <Num value={t.netPnl} className="text-right text-[15px]" />
          </div>
        </button>
        <Link href={href} aria-label={`Open ${t.root} trade at ${time}`} className="hidden w-12 shrink-0 place-items-center font-mono text-[13px] text-ink-4 transition-colors duration-300 hover:text-gold md:grid">
          →
        </Link>
      </div>

      <div className={cn("grid transition-[grid-template-rows] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className={cn("min-h-0 overflow-hidden", open && "t-drawn")} inert={!open}>
          {seen && <Preview t={t} tz={tz} href={href} defaultRisk={defaultRisk} />}
        </div>
      </div>
    </div>
  );
}

function Preview({ t, tz, href, defaultRisk }: { t: Trade; tz: string; href: string; defaultRisk: number | null }) {
  const r = rMultiple(t, defaultRisk);
  const img = chartImage(t.chartUrl);
  const facts: [string, React.ReactNode][] = [
    ["Felt", t.emotion ? <span className="text-ink">{t.emotion}</span> : <span className="text-ink-4">—</span>],
    [
      "Execution",
      <span key="x" className="inline-flex items-center gap-3">
        <Diamonds value={t.rating} />
        {t.rating ? <span className="text-ink-3">{RATING_WORDS[t.rating]}</span> : null}
      </span>,
    ],
    ["Plan", t.followedPlan === true ? <span className="text-pos">Followed</span> : t.followedPlan === false ? <span className="text-neg">Broken</span> : <span className="text-ink-4">—</span>],
    ["R", r !== null ? <span className={cn("num", r > 0 ? "text-pos" : r < 0 ? "text-neg" : "")}>{`${r > 0 ? "+" : r < 0 ? "−" : ""}${fmtNum(Math.abs(r), 2)}R`}</span> : <span className="text-ink-4">—</span>],
    ["Fees", <span key="f" className="num text-ink-2">{fmtMoney(t.fees, { cents: true })}</span>],
  ];

  return (
    <div className="grid gap-x-12 gap-y-8 pt-3 pb-10 pl-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] md:pr-12 md:pl-[5.75rem]">
      <div className="min-w-0">
        {t.notes ? (
          <p className="line-clamp-6 max-w-[42ch] font-serif text-[1.12rem] leading-[1.6] font-light text-ink-2 italic">“{t.notes}”</p>
        ) : (
          <p className="max-w-[34ch] font-mono text-[11.5px] leading-[1.9] text-ink-4">No notes yet. Two honest lines while it&apos;s fresh are worth more than a perfect essay later.</p>
        )}
        {t.mistakes.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {t.mistakes.map((m) => (
              <Tag key={m} tone="neg">
                × {m}
              </Tag>
            ))}
          </div>
        )}
      </div>

      <dl className="min-w-0 self-start border-t border-line">
        {facts.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[6.5rem_1fr] items-baseline border-b border-line py-2.5 font-mono text-[12px]">
            <dt className="text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="min-w-0">
        {img ? (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" className="block aspect-[16/9] w-full border border-line object-cover" />
            <figcaption className="mt-2.5 font-mono text-[9px] tracking-[0.26em] text-ink-4 uppercase">Fig. — {t.root} · chart</figcaption>
          </figure>
        ) : (
          <PriceTrace trade={t} tz={tz} compact />
        )}
        <LinkBtn href={href} variant="secondary" size="sm" className="mt-6 w-full md:w-auto">
          Open the trade →
        </LinkBtn>
      </div>
    </div>
  );
}
