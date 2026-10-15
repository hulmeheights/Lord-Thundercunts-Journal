"use client";

import { motion } from "motion/react";
import { Odometer } from "@/components/motion/Odometer";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import { shortDate } from "@/lib/analytics/time";

export type ThreadDay = { day: string; closed: boolean; traded: boolean };
export type BentoStats = {
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

const rise = (i: number) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const, delay: 0.06 * i },
});

function Tile({ i, label, children, sub, className }: { i: number; label: string; children: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <motion.div {...rise(i)} className={cn("glass lift flex min-h-[176px] flex-col rounded-[24px] p-6", className)}>
      <div className="eyebrow">{label}</div>
      <div className="mt-auto pt-6">{children}</div>
      {sub && <div className="mt-2 text-[13px] leading-snug text-ink-3">{sub}</div>}
    </motion.div>
  );
}

/** A green thread that grows one leaf for every session you closed your process. */
function Thread({ days }: { days: ThreadDay[] }) {
  const W = 560;
  const H = 72;
  const n = Math.max(days.length, 2);
  const x = (i: number) => 10 + (i / (n - 1)) * (W - 20);
  const y = (i: number) => H / 2 + Math.sin(i * 0.85) * 9;
  const d = days.map((_, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(i).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[72px] w-full overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke="var(--line-2)" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" />
      <motion.path
        d={d}
        fill="none"
        stroke="var(--pos)"
        strokeWidth="1.75"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: days.filter((t) => t.closed).length ? 1 : 0 }}
        viewport={{ once: true }}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ opacity: 0.35 }}
      />
      {days.map((t, i) => {
        const up = i % 2 === 0;
        return (
          <g key={t.day}>
            {t.closed && (
              <motion.path
                d={`M${x(i)},${y(i)} q ${up ? "6,-16 0,-22" : "6,16 0,22"} q ${up ? "-6,6 0,22" : "-6,-6 0,-22"}`}
                fill="var(--glow)"
                fillOpacity="0.55"
                stroke="var(--pos)"
                strokeWidth="1"
                initial={{ scale: 0, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.4 + i * 0.05 }}
                style={{ transformOrigin: `${x(i)}px ${y(i)}px` }}
              />
            )}
            <circle
              cx={x(i)}
              cy={y(i)}
              r={t.closed ? 3.6 : 2.6}
              fill={t.closed ? "var(--pos)" : "var(--surface)"}
              stroke={t.closed ? "var(--pos)" : t.traded ? "var(--ink-3)" : "var(--ink-4)"}
              strokeWidth="1.3"
            >
              <title>{`${shortDate(t.day)} · ${t.closed ? "process closed" : t.traded ? "traded, process open" : "no session"}`}</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

export function Bento({ s }: { s: BentoStats }) {
  const delta = s.winRatePrev === null ? null : Math.round((s.winRate - s.winRatePrev) * 100);
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Tile
        i={0}
        label="Win rate · 30 days"
        sub={
          delta === null ? `${s.trades} trades` : (
            <span>
              <span className={cn("num", delta > 0 ? "text-pos" : delta < 0 ? "text-neg" : "")}>{delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta)} pts</span> vs the 30 before
            </span>
          )
        }
      >
        <Odometer value={s.winRate} format="percent" tone={false} face="display" className="text-[46px] leading-none font-semibold" />
      </Tile>
      <Tile i={1} label="Profit factor" sub={Number.isFinite(s.profitFactor) && s.profitFactor > 0 ? `Won ${fmtMoney(s.profitFactor, { cents: true })} for every $1 lost` : "No losses yet"}>
        <Odometer value={Number.isFinite(s.profitFactor) ? s.profitFactor : 0} format="ratio" decimals={2} tone={false} face="display" className="text-[46px] leading-none font-semibold" />
      </Tile>
      <Tile i={2} label={s.avgR !== null ? "Average R" : "Per trade"} sub={s.avgR !== null ? "Measured against your planned risk" : "Average net result per trade"}>
        {s.avgR !== null ? (
          <Odometer value={s.avgR} format="number" decimals={2} suffix="R" face="display" className="text-[46px] leading-none font-semibold" />
        ) : (
          <Odometer value={s.expectancy} decimals={s.expectancy !== 0 && Math.abs(s.expectancy) < 100 ? 2 : 0} face="display" className="text-[46px] leading-none font-semibold" />
        )}
      </Tile>
      <Tile i={3} label="Clean days" sub={`${s.cleanDays} of ${s.tradingDays} sessions inside every rule`}>
        <Odometer value={s.tradingDays ? s.cleanDays / s.tradingDays : 0} format="percent" tone={false} face="display" className="text-[46px] leading-none font-semibold" />
      </Tile>
      <motion.div {...rise(4)} className="glass lift col-span-2 flex min-h-[176px] flex-col rounded-[24px] p-6">
        <div className="flex items-baseline justify-between gap-3">
          <div className="eyebrow">Process streak</div>
          <div className="text-[13px] text-ink-3">Last {s.thread.length} sessions</div>
        </div>
        <div className="mt-3 flex items-end gap-5">
          <div className="shrink-0">
            <div className="num-display text-[46px] leading-none font-semibold">{s.streak}</div>
            <div className="mt-1.5 text-[13px] text-ink-3">{s.streak === 1 ? "day" : "days"} unbroken</div>
          </div>
          <div className="min-w-0 flex-1">
            <Thread days={s.thread} />
          </div>
        </div>
      </motion.div>
      <motion.div {...rise(5)} className="glass lift col-span-2 flex min-h-[176px] flex-col rounded-[24px] p-6">
        <div className="eyebrow">Best setup · 30 days</div>
        {s.bestSetup ? (
          <div className="mt-auto pt-6">
            <div className="display text-[clamp(28px,3.4vw,40px)]">{s.bestSetup.name}</div>
            <div className="mt-2 text-[13px] text-ink-3">
              <span className="num text-pos">{fmtMoney(s.bestSetup.expectancy, { sign: true })}</span> a trade across {s.bestSetup.trades} trades
            </div>
          </div>
        ) : (
          <div className="mt-auto pt-6 text-[14.5px] leading-relaxed text-ink-3">
            Tag a setup on each trade and the one that pays you will surface here.
          </div>
        )}
      </motion.div>
    </div>
  );
}
