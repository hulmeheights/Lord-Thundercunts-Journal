"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Trade } from "@/lib/types";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import { addDays, dayKey, holdMinutes, todayKey } from "@/lib/analytics/time";
import { accountRisks, summarize } from "@/lib/analytics/stats";
import { motionKit, prefersReducedMotion } from "@/lib/motion";
import { Btn, Label, Num, Stats } from "@/components/m";
import { Seg } from "@/components/m/Seg";
import { SectionIndex } from "@/components/m/SectionIndex";
import { Odometer } from "@/components/motion/Odometer";
import { Sheet } from "@/components/ui/Sheet";
import { ManualTradeForm } from "./ManualTradeForm";
import { ImportSheet } from "./ImportSheet";
import { Tape } from "./Tape";
import { DayTicks } from "./DayTicks";
import { TradeRow } from "./TradeRow";
import { dayLabel, spell } from "./lib";
import { d, RiseStyle } from "./Rise";
import { RevealScope } from "./RevealScope";
import { Empty, Lead, Stat } from "./kit";

type Range = "7" | "30" | "90" | "all";
type Result = "all" | "win" | "loss";

const RANGE_WORD: Record<Range, string> = { "7": "7 days", "30": "30 days", "90": "90 days", all: "all time" };
const SESSIONS_PER_PAGE = 10;

export function TradeList({
  trades,
  tz,
  setups,
  accounts,
  openImport = false,
  defaultRisk = null,
  accountRisk,
}: {
  trades: Trade[];
  tz: string;
  setups: string[];
  accounts: string[];
  openImport?: boolean;
  defaultRisk?: number | null;
  accountRisk?: Record<string, number>;
}) {
  const [range, setRange] = useState<Range>("30");
  const [result, setResult] = useState<Result>("all");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(openImport);
  const [open, setOpen] = useState<string | null>(null);
  const [pages, setPages] = useState(1);
  const search = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const flip = useRef<ReturnType<ReturnType<typeof motionKit>["Flip"]["getState"]> | null>(null);

  const filtered = useMemo(() => {
    const today = todayKey(tz);
    const from = range === "all" ? "0000" : addDays(today, -Number(range));
    const needle = query.trim().toLowerCase();
    return trades
      .filter((t) => dayKey(t.exitTime, tz) >= from)
      .filter((t) => (result === "win" ? t.netPnl > 0 : result === "loss" ? t.netPnl < 0 : true))
      .filter((t) =>
        !needle
          ? true
          : [t.symbol, t.root, t.direction, ...t.setups, t.emotion ?? "", ...t.tags, ...t.mistakes, t.notes ?? ""].join(" ").toLowerCase().includes(needle),
      )
      .sort((a, b) => b.exitTime.localeCompare(a.exitTime));
  }, [trades, tz, range, result, query]);

  const groups = useMemo(() => {
    const m = new Map<string, Trade[]>();
    for (const t of filtered) {
      const k = dayKey(t.exitTime, tz);
      const list = m.get(k);
      if (list) list.push(t);
      else m.set(k, [t]);
    }
    return [...m.entries()];
  }, [filtered, tz]);

  const oldestFirst = useMemo(() => [...filtered].reverse(), [filtered]);
  const tickMax = useMemo(() => filtered.reduce((m, t) => Math.max(m, Math.abs(t.netPnl)), 1), [filtered]);
  const s = summarize(filtered, { defaultRisk, accountRisk });
  const usual = useMemo(() => accountRisks(trades, { defaultRisk, accountRisk }), [trades, defaultRisk, accountRisk]);
  const avgHold = filtered.length ? filtered.reduce((x, t) => x + holdMinutes(t.entryTime, t.exitTime), 0) / filtered.length : 0;
  const shown = groups.slice(0, pages * SESSIONS_PER_PAGE);
  const remaining = groups.length - shown.length;

  // GSAP Flip: capture positions before a filter change, play them after render.
  const withFlip = useCallback(<T,>(set: (v: T) => void) => (v: T) => {
    if (log.current && !prefersReducedMotion()) flip.current = motionKit().Flip.getState(log.current.querySelectorAll("[data-flip-id]"));
    setOpen(null);
    set(v);
  }, []);
  useLayoutEffect(() => {
    const state = flip.current;
    if (!state || !log.current) return;
    flip.current = null;
    const { Flip, gsap } = motionKit();
    Flip.from(state, {
      targets: log.current.querySelectorAll("[data-flip-id]"),
      duration: 0.75,
      ease: "calm",
      stagger: 0.006,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.012, ease: "calm" }),
    });
  }, [filtered]);

  // "/" focuses the search, like a terminal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || el?.closest("input,textarea,select,[contenteditable=true]")) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const wins = filtered.filter((t) => t.netPnl > 0).length;
  const losses = filtered.filter((t) => t.netPnl < 0).length;
  const kept = s.totalWon > 0 ? s.net / s.totalWon : null;
  const share = s.totalWon + s.totalLost > 0 ? s.totalWon / (s.totalWon + s.totalLost) : 0.5;
  // Average hold as a rolling figure: seconds, minutes, or hours to one decimal.
  const hold =
    avgHold < 1
      ? { value: Math.max(1, Math.round(avgHold * 60)), unit: "sec", decimals: 0 }
      : avgHold < 60
        ? { value: Math.round(avgHold), unit: "min", decimals: 0 }
        : { value: Math.round((avgHold / 60) * 10) / 10, unit: "hrs", decimals: 1 };
  const filtersOn = result !== "all" || query.trim() !== "";

  const sub = filtered.length
    ? `${filtered.length} round trip${filtered.length === 1 ? "" : "s"} across ${groups.length} session${groups.length === 1 ? "" : "s"} — ${wins} paid, ${losses} cost. Every fill paired, every fee counted.`
    : trades.length
      ? "Nothing on the tape for this range. Widen it, or clear the search."
      : "Nothing on the tape yet. Connect a broker in Settings, import an export, or log one by hand.";

  const lead =
    s.trades === 0 ? null : s.net > 0 ? (
      s.winRate >= 0.5 ? (
        <>
          Right more often than not, and <em>paid</em> for it.
        </>
      ) : (
        <>
          Wrong more often than right — and still <em>paid</em>.
        </>
      )
    ) : s.winRate >= 0.5 ? (
      <>
        Right more often than not — but the losers <em>cost more</em>.
      </>
    ) : (
      <>
        A stretch to <em>learn</em> from, not to repeat.
      </>
    );

  return (
    <div>
      <RiseStyle />
      <RevealScope />
      {/* The fixed index only clears the money column on very wide screens. */}
      <div className="hidden min-[1600px]:block">
        <SectionIndex ids={["tape", "numbers", "log"]} />
      </div>

      {/* ── 00 · the tape ─────────────────────────────────────────── */}
      <header id="tape" className="scroll-mt-24 pt-6 sm:pt-10">
        <div className="t-rise eyebrow mb-[clamp(1.4rem,3.5vh,2.4rem)] !tracking-[0.3em] sm:!tracking-[0.42em]">Every execution, paired and costed</div>
        <h1 className="t-rise font-serif text-[clamp(3.2rem,8.2vw,7rem)] leading-[1] font-light tracking-[-0.01em]" style={d(80)}>
          The <em className="italic">tape</em>.
        </h1>

        <Tape trades={oldestFirst} tz={tz} className="t-rise mt-[clamp(2.4rem,7vh,4rem)]" style={d(160)} />

        <div className="mt-[clamp(2rem,5vh,3rem)] flex flex-wrap items-end justify-between gap-x-10 gap-y-8">
          <p className="t-rise max-w-[40ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2" style={d(240)}>
            {sub}
          </p>
          <div className="t-rise shrink-0 text-right font-mono max-sm:text-left" style={d(300)}>
            <Odometer value={s.net} className="text-[clamp(1.9rem,3.6vw,2.8rem)] font-light" delay={250} />
            <div className="mt-2 font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase">
              Net · {RANGE_WORD[range]} · {s.trades} trade{s.trades === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="t-rise mt-[clamp(2.4rem,6vh,3.6rem)] flex flex-wrap items-center gap-x-4 gap-y-4" style={d(360)}>
          <Btn variant="primary" size="lg" onClick={() => setAdding(true)}>
            Add trade
          </Btn>
          <Btn variant="secondary" size="lg" onClick={() => setImporting(true)}>
            Import
          </Btn>
          <a href="#log" className="ml-3 font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase transition-colors duration-300 hover:text-ink max-sm:mt-2 max-sm:ml-0 max-sm:w-full">
            ↓ the log
          </a>
        </div>
      </header>

      {/* ── filters: a hairline band that stays with you on desktop ───── */}
      <div className="t-rise z-20 mt-[clamp(4.5rem,11vh,8rem)] border-y border-line bg-bg py-5 lg:sticky lg:top-0" style={d(440)}>
        <div className="flex flex-wrap items-center gap-x-10 gap-y-5">
          <div className="flex items-center gap-5">
            <span className="w-12 font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase sm:w-auto">Range</span>
            <Seg
              value={range}
              onChange={withFlip(setRange)}
              options={[
                { value: "7", label: "7D" },
                { value: "30", label: "30D" },
                { value: "90", label: "90D" },
                { value: "all", label: "All" },
              ]}
            />
          </div>
          <div className="flex items-center gap-5">
            <span className="w-12 font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase sm:w-auto">Show</span>
            <Seg
              value={result}
              onChange={withFlip(setResult)}
              options={[
                { value: "all", label: "All" },
                { value: "win", label: "Wins" },
                { value: "loss", label: "Losses" },
              ]}
            />
          </div>
          <label className="flex min-w-0 flex-1 basis-full items-center gap-3 border-b border-line-2 transition-colors duration-300 focus-within:border-ink-3 md:ml-auto md:max-w-[22rem] md:basis-auto">
            <span className="sr-only">Search trades</span>
            <input
              ref={search}
              value={q}
              onChange={(e) => {
                setOpen(null);
                setQ(e.target.value);
              }}
              placeholder="Search symbol, setup, mistake, note"
              className="min-w-0 flex-1 bg-transparent py-2 font-mono text-[12px] tracking-[0.04em] text-ink outline-none placeholder:text-ink-4 focus-visible:!outline-none"
            />
            {q ? (
              <button type="button" onClick={() => setQ("")} className="font-mono text-[13px] text-ink-4 transition-colors hover:text-ink" aria-label="Clear search">
                ×
              </button>
            ) : (
              <kbd className="hidden border border-line px-1.5 font-mono text-[9px] leading-[1.6] text-ink-4 md:inline">/</kbd>
            )}
          </label>
        </div>
      </div>

      {/* ── 01 · the numbers ─────────────────────────────────────── */}
      {s.trades > 0 && (
        <section id="numbers" className="scroll-mt-28 py-[clamp(4rem,10vh,8rem)]">
          <div className="t-rv mb-[clamp(2rem,5vh,3rem)]">
            <Label n={1}>The numbers</Label>
          </div>
          {lead && <Lead className="mb-[clamp(2.5rem,7vh,4.5rem)] max-w-[22ch]">{lead}</Lead>}
          <Stats className="[&_.num]:!text-[clamp(2.4rem,4.2vw,3.6rem)]">
            <Stat
              value={<Odometer value={Math.round(s.winRate * 100)} format="number" sign={false} tone={false} />}
              unit="%"
              label="Win rate"
              sub={`${wins} won · ${losses} lost`}
            />
            <Stat
              value={<Odometer value={s.profitFactor} format="ratio" decimals={2} sign={false} tone={false} delay={80} />}
              label="Profit factor"
              sub="Gross won ÷ gross lost"
              d={80}
            />
            <Stat
              value={<Odometer value={s.expectancy} sign tone delay={160} decimals={Math.abs(s.expectancy) < 10 ? 2 : 0} />}
              label="Per trade"
              sub={s.avgR !== null ? `${s.avgR >= 0 ? "+" : "−"}${Math.abs(s.avgR).toFixed(2)}R on average` : "Expectancy, after fees"}
              d={160}
            />
            <Stat
              value={<Odometer value={hold.value} format="number" decimals={hold.decimals} sign={false} tone={false} delay={240} />}
              unit={hold.unit}
              label="Average hold"
              sub={`Winners ${Math.round(s.avgHoldWin)}m · losers ${Math.round(s.avgHoldLoss)}m`}
              d={240}
            />
          </Stats>

          {/* made vs lost: one hairline, split where the money went */}
          <div className="t-rv mt-[clamp(3.5rem,9vh,5.5rem)]" style={d(120)}>
            <div className="flex items-baseline justify-between gap-6 font-mono">
              <div>
                <div className="text-[9px] tracking-[0.3em] text-ink-4 uppercase">Made</div>
                <Num value={s.totalWon} className="mt-1.5 block text-[clamp(1.1rem,2vw,1.4rem)] font-light" />
              </div>
              <div className="text-right">
                <div className="text-[9px] tracking-[0.3em] text-ink-4 uppercase">Gave back</div>
                <Num value={-s.totalLost} className="mt-1.5 block text-[clamp(1.1rem,2vw,1.4rem)] font-light" />
              </div>
            </div>
            <div className="relative mt-4 flex h-[2px] gap-[3px]">
              <i className="block h-full bg-pos transition-[width] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ width: `${share * 100}%` }} />
              <i className="block h-full flex-1 bg-neg/55" />
              <span
                aria-hidden
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] leading-none text-gold transition-[left] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ left: `calc(${share * 100}% + 1.5px)` }}
              >
                ◆
              </span>
            </div>
            <p className="mt-6 max-w-[48ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-3">
              {kept === null
                ? "No winners in this view yet."
                : kept >= 0
                  ? `You kept ${Math.round(kept * 100)}¢ of every dollar the winners made. Fees took ${fmtMoney(s.fees)}.`
                  : `The losers took back everything the winners made, and ${fmtMoney(-s.net)} more. Fees took ${fmtMoney(s.fees)}.`}
            </p>
          </div>
        </section>
      )}

      {/* ── 02 · the log ──────────────────────────────────────────── */}
      <section id="log" className={cn("scroll-mt-28 pb-[clamp(3rem,8vh,6rem)]", s.trades === 0 && "pt-[clamp(4rem,10vh,8rem)]")}>
        <div className="t-rv mb-[clamp(2.5rem,6vh,3.5rem)] flex flex-wrap items-baseline justify-between gap-4">
          <Label n={s.trades > 0 ? 2 : 1}>The log</Label>
          {groups.length > 0 && (
            <span className="font-mono text-[9.5px] tracking-[0.28em] text-ink-4 uppercase">
              {filtered.length} trade{filtered.length === 1 ? "" : "s"} · {groups.length} session{groups.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {groups.length === 0 ? (
          trades.length === 0 ? (
            <Empty
              title={
                <>
                  Nothing on the tape yet. <em>Patience</em> is a position.
                </>
              }
              action={
                <div className="flex flex-wrap gap-4">
                  <Btn variant="primary" onClick={() => setImporting(true)}>
                    Import an export
                  </Btn>
                  <Btn variant="secondary" onClick={() => setAdding(true)}>
                    Log one by hand
                  </Btn>
                </div>
              }
            >
              Connect a broker in Settings and every fill lands here on its own — paired, costed and timed.
            </Empty>
          ) : (
            <Empty
              title={
                filtersOn ? (
                  <>
                    Nothing matches. The tape is <em>quiet</em> here.
                  </>
                ) : (
                  <>
                    No trades in {RANGE_WORD[range]}. <em>Patience</em> is a position.
                  </>
                )
              }
              action={
                <div className="flex flex-wrap gap-4">
                  {range !== "all" && (
                    <Btn variant="secondary" onClick={() => withFlip(setRange)("all")}>
                      Show all time
                    </Btn>
                  )}
                  {filtersOn && (
                    <Btn
                      variant="ghost"
                      onClick={() => {
                        setQ("");
                        setResult("all");
                      }}
                    >
                      Clear filters
                    </Btn>
                  )}
                </div>
              }
            />
          )
        ) : (
          <div ref={log}>
            {shown.map(([day, list]) => {
              const net = list.reduce((x, t) => x + t.netPnl, 0);
              const won = list.filter((t) => t.netPnl > 0).length;
              const lost = list.filter((t) => t.netPnl < 0).length;
              return (
                <div key={day} className="t-rv mb-[clamp(2.6rem,6vh,4rem)]">
                  <div data-flip-id={`day-${day}`} className="flex items-baseline justify-between gap-4 border-b border-line-2 pb-3">
                    <div className="flex items-baseline gap-4">
                      <Link href={`/journal/${day}`} className="font-mono text-[10.5px] tracking-[0.3em] text-ink-2 uppercase transition-colors duration-300 hover:text-ink">
                        {dayLabel(day)}
                      </Link>
                      <span className="font-mono text-[9px] tracking-[0.26em] text-ink-4 uppercase">
                        {spell(list.length)} trade{list.length === 1 ? "" : "s"} · <span className="text-pos">{won} won</span> · <span className="text-neg">{lost} lost</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-6">
                      <DayTicks trades={list} max={tickMax} className="max-sm:hidden" />
                      <Num value={net} className="text-[13px]" />
                    </div>
                  </div>
                  {list.map((t) => (
                    <TradeRow key={t.id} t={t} tz={tz} defaultRisk={defaultRisk} usual={usual.get(t.accountId ?? t.source) ?? null} open={open === t.id} onToggle={() => setOpen((o) => (o === t.id ? null : t.id))} />
                  ))}
                </div>
              );
            })}
            {remaining > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <span className="font-mono text-[9.5px] tracking-[0.28em] text-ink-4 uppercase">
                  {remaining} earlier session{remaining === 1 ? "" : "s"}
                </span>
                <Btn variant="secondary" onClick={() => setPages((p) => p + 1)}>
                  ↓ Earlier sessions
                </Btn>
              </div>
            )}
          </div>
        )}
      </section>

      <Sheet
        open={importing}
        onClose={() => setImporting(false)}
        title={
          <>
            Import <em>trades</em>.
          </>
        }
        wide
      >
        <ImportSheet tz={tz} accounts={accounts} onDone={() => setImporting(false)} />
      </Sheet>

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title={
          <>
            Log a trade <em>by hand</em>.
          </>
        }
      >
        <ManualTradeForm setups={setups} tz={tz} onDone={() => setAdding(false)} />
      </Sheet>
    </div>
  );
}
