"use client";

import { useState } from "react";
import Link from "next/link";
import { Num, Section, Stats } from "@/components/m";
import { Seg } from "@/components/m/Seg";
import type { Grain, MindRow, MindSummary } from "@/lib/analytics/mind";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Figure } from "./Figure";

const GRAIN_LABEL: Record<Grain, string> = { day: "Day", week: "Week", month: "Month", year: "Year" };
const SHOW: Record<Grain, number> = { day: 21, week: 12, month: 12, year: 10 };
const FEEL_LABEL = { clear: "Clear-headed days", level: "Level days", bumpy: "Bumpy days" } as const;
const FEEL_SUB = { clear: "checked in 4 or 5", level: "somewhere in between", bumpy: "checked in 1 or 2" } as const;

/** Five diamonds, filled to the score (1–5). */
function Meter({ score }: { score: number | null }) {
  if (score === null) return <span className="font-mono text-[10px] tracking-[0.2em] text-ink-4 uppercase">not logged</span>;
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`${score} of 5`} title={`${score} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn("text-[10px] leading-none", score >= i - 0.25 ? (score >= 3.75 ? "text-pos" : score <= 2.5 ? "text-ink-3" : "text-gold") : "text-line-2")}>
          ◆
        </span>
      ))}
    </span>
  );
}

function Row({ r, grain }: { r: MindRow; grain: Grain }) {
  return (
    <div className="grid gap-x-6 gap-y-2 border-b border-line py-5 md:grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)_8rem]">
      <div>
        <div className="font-serif text-[clamp(1.1rem,1.8vw,1.3rem)] font-light">{r.label}</div>
        <div className="mt-1 font-mono text-[9.5px] tracking-[0.2em] text-ink-4 uppercase">
          {r.tradingDays ? `${r.tradingDays} trading ${r.tradingDays === 1 ? "day" : "days"}` : "no trades"}
          {grain !== "day" && r.tradingDays > 0 && ` · ${r.greenDays} green · ${r.redDays} red`}
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] tracking-[0.18em] text-ink-3 uppercase">
          <span className="inline-flex items-center gap-2">
            Feel <Meter score={r.feel} />
          </span>
          {r.readiness !== null && <span>Morning {r.readiness.toFixed(1)}</span>}
          {r.moodAfter !== null && <span>After the bell {r.moodAfter.toFixed(1)}</span>}
        </div>
        {r.tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5">
            {r.tags.map((t) => (
              <span key={t.tag} className="font-mono text-[10px] tracking-[0.16em] text-gold uppercase">
                ◆ {t.tag}
                {grain !== "day" && t.days > 1 && <span className="text-ink-4"> ×{t.days}</span>}
              </span>
            ))}
          </div>
        )}
        {r.notes.slice(0, grain === "day" ? 1 : 2).map((n) => (
          <p key={n.day} className="mt-2.5 max-w-[70ch] font-serif text-[1.02rem] leading-[1.55] font-light text-ink-2 italic" data-private>
            {grain !== "day" && <span className="mr-2 font-mono text-[9.5px] tracking-[0.18em] text-ink-4 not-italic uppercase">{n.day.slice(5)}</span>}
            {n.note}
          </p>
        ))}
      </div>
      <div className="md:text-right">
        {r.tradingDays ? <Num value={r.net} className="text-[15px]" /> : <span className="font-mono text-[11px] text-ink-4">—</span>}
        {r.trades > 0 && <div className="mt-1 font-mono text-[9.5px] tracking-[0.18em] text-ink-4 uppercase">{r.trades} trades</div>}
      </div>
    </div>
  );
}

/** How you've been: feelings and life, day by day up to year by year, beside the P&L. */
export function MindSection({ rows, summary, n, today }: { rows: Record<Grain, MindRow[]>; summary: MindSummary; n: number; today: string }) {
  const [grain, setGrain] = useState<Grain>("week");
  const [more, setMore] = useState(false);
  const list = rows[grain];
  const shown = more ? list : list.slice(0, SHOW[grain]);
  const tags = summary.tags.slice(0, 6);

  return (
    <Section
      id="mind"
      n={n}
      label="How you've been"
      aside={
        <Link href={`/journal/${today}`} className="eyebrow hover:text-ink">
          Log today →
        </Link>
      }
      lead={
        <>
          The <em>mind</em> behind the P&amp;L.
        </>
      }
    >
      <p className="reveal -mt-6 mb-[clamp(2.5rem,6vh,4rem)] max-w-[62ch] font-mono text-[11.5px] leading-[1.9] text-ink-3">
        Your morning check-in, the mood after the bell, and what was going on outside the charts, lined up against each day&apos;s P&amp;L. Log it
        in the journal: “Outside the charts”.
      </p>

      {summary.days > 0 && (
        <Stats cols={3}>
          {summary.buckets.map((b, i) => (
            <Figure
              key={b.feel}
              size="lg"
              value={b.avgNet === null ? "—" : fmtMoney(b.avgNet, { sign: true })}
              tone={b.avgNet === null ? null : b.avgNet > 0 ? "pos" : b.avgNet < 0 ? "neg" : null}
              label={`${FEEL_LABEL[b.feel]} · average`}
              sub={b.days ? `${b.days} ${b.days === 1 ? "day" : "days"} · ${Math.round((b.greenRate ?? 0) * 100)}% green · ${FEEL_SUB[b.feel]}` : FEEL_SUB[b.feel]}
              d={i * 80}
            />
          ))}
        </Stats>
      )}

      {tags.length > 0 && (
        <div className="reveal mt-[clamp(3rem,7vh,4.5rem)]">
          <div className="mb-4 eyebrow">What was going on · average day</div>
          <div className="border-t border-line">
            {tags.map((t) => (
              <div key={t.tag} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b border-line py-3.5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
                <span className="font-mono text-[11px] tracking-[0.16em] text-ink uppercase">{t.tag}</span>
                <span className="font-mono text-[10.5px] text-ink-4 max-sm:hidden">
                  {t.days} days{t.otherAvg !== null && ` · ${fmtMoney(t.otherAvg, { sign: true })} on other days`}
                </span>
                <Num value={t.avgNet} className="text-[13px]" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="reveal mt-[clamp(3.5rem,8vh,5rem)] mb-4 flex flex-wrap items-baseline justify-between gap-4">
        <Seg
          value={grain}
          onChange={(g) => {
            setGrain(g);
            setMore(false);
          }}
          options={(Object.keys(GRAIN_LABEL) as Grain[]).map((g) => ({ value: g, label: GRAIN_LABEL[g] }))}
        />
        <span className="eyebrow">newest first</span>
      </div>
      {list.length === 0 ? (
        <p className="border-t border-line pt-6 font-mono text-[11.5px] leading-[1.9] text-ink-3">
          Nothing logged yet. Do the morning check-in on Today, and the mood and “Outside the charts” in the journal.
        </p>
      ) : (
        <div className="border-t border-line">
          {shown.map((r) => (
            <Row key={r.key} r={r} grain={grain} />
          ))}
        </div>
      )}
      {list.length > SHOW[grain] && (
        <button type="button" onClick={() => setMore((m) => !m)} className="mt-6 font-mono text-[10px] tracking-[0.26em] text-ink-3 uppercase hover:text-ink">
          {more ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </Section>
  );
}
