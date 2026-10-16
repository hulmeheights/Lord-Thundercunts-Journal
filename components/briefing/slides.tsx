"use client";

import Link from "next/link";
import { motion, type Variants } from "motion/react";
import type { BriefingWindow, Slide } from "@/lib/analytics/briefing";
import type { AiBriefing } from "@/lib/ai/briefing";
import { cn } from "@/lib/cn";
import { fmtMoney, fmtPct, fmtPrice } from "@/lib/format";
import { fmtHold, longDate, WEEKDAYS } from "@/lib/analytics/time";
import { LivingLine } from "@/components/charts/LivingLine";
import { Odometer } from "@/components/motion/Odometer";
import { LimitLine } from "@/components/m/LimitLine";
import { Dot } from "@/components/m";

export type AiState =
  | { status: "loading" }
  | { status: "disabled" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AiBriefing };

/** What each slide is called in the replay's chapter line ("04 — The money"). */
export const SLIDE_NAMES: Record<Slide["kind"], string> = {
  cover: "The session",
  money: "The money",
  scoreboard: "The numbers",
  curve: "The shape",
  calendar: "Day by day",
  trade: "The trade",
  insight: "The pattern",
  discipline: "The rules",
  mind: "The mind",
  reportcard: "Report card",
  guardian: "The account",
  ai: "The coach",
  capsule: "Time capsule",
  focus: "Tomorrow",
  observer: "From outside",
  outro: "Fin",
};

const EASE = [0.16, 1, 0.3, 1] as const;
const stage: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } };
const rise: Variants = { hidden: { opacity: 0, y: 26 }, show: { opacity: 1, y: 0, transition: { duration: 1, ease: EASE } } };

function Stage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={stage} initial="hidden" animate="show" className={cn("flex h-full min-h-0 w-full flex-col justify-center", className)}>
      {children}
    </motion.div>
  );
}
function Item({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={rise} className={className}>
      {children}
    </motion.div>
  );
}
/** The keynote statement: Fraunces light, one word in italics. */
function Statement({ children, className, size = "lg" }: { children: React.ReactNode; className?: string; size?: "xl" | "lg" | "md" }) {
  return (
    <h2
      className={cn(
        "max-w-[18ch] font-serif leading-[1.02] font-light tracking-[-0.01em] text-ink [&_em]:italic",
        size === "xl" && "text-[clamp(3rem,9vw,8rem)] leading-[0.98]",
        size === "lg" && "text-[clamp(2.3rem,6vw,5.2rem)]",
        size === "md" && "max-w-[24ch] text-[clamp(1.8rem,4.2vw,3.6rem)] leading-[1.1]",
        className,
      )}
    >
      {children}
    </h2>
  );
}
const Body = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <p className={cn("max-w-[44ch] font-mono text-[clamp(12px,1.1vw,14px)] leading-[1.9] tracking-[0.03em] text-ink-2", className)}>{children}</p>
);
const Cap = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase", className)}>{children}</div>
);
const tone = (n: number) => (n > 0.004 ? "text-pos" : n < -0.004 ? "text-neg" : "text-ink");
const Money = ({ v, sign = true, className }: { v: number; sign?: boolean; className?: string }) => <span className={cn("num", tone(v), className)}>{fmtMoney(v, { sign })}</span>;

/** A hairline bar that fills: jade when it's good news, cream otherwise. */
function Fill({ pct, good = true, delay = 0.5 }: { pct: number; good?: boolean; delay?: number }) {
  return (
    <div className="relative h-px w-full bg-line-2" data-private>
      <motion.i
        className={cn("absolute inset-y-0 left-0 block", good ? "bg-pos shadow-[0_0_10px_rgba(116,184,156,0.6)]" : "bg-ink")}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }}
        transition={{ duration: 1.4, ease: EASE, delay }}
      />
    </div>
  );
}

const unit = (p: string) => (p === "daily" ? "day" : p === "weekly" ? "week" : "month");

export function SlideView({ slide, ai, window: w, onReplay }: { slide: Slide; ai: AiState; window: BriefingWindow; onReplay: () => void }) {
  switch (slide.kind) {
    case "cover":
      return (
        <Stage className="justify-between">
          <Item>
            <Cap className="!tracking-[0.42em]">{slide.label}</Cap>
          </Item>
          <Item>
            <Statement size="xl">
              {slide.rest ? (
                <>
                  A day of <em>rest</em>.
                </>
              ) : (
                <>
                  {slide.title.split(" ").slice(0, -1).join(" ")} <em>{slide.title.split(" ").slice(-1)}</em>.
                </>
              )}
            </Statement>
          </Item>
          <Item className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
            {slide.rest ? (
              <Body>No trades. The edge stays sharp when you protect it, and sitting out is a position.</Body>
            ) : (
              <>
                <Body>
                  {slide.trades} trade{slide.trades === 1 ? "" : "s"}, {fmtPct(slide.winRate)} of them won. Here&apos;s how the {unit(w.period)} actually went.
                </Body>
                <div className="text-right max-sm:text-left">
                  <Odometer value={slide.net} delay={600} className="text-[clamp(2.6rem,7vw,5.6rem)] leading-none font-light tracking-[-0.02em]" />
                  <Cap className="mt-3">Net · after fees</Cap>
                </div>
              </>
            )}
          </Item>
        </Stage>
      );

    case "money": {
      const max = Math.max(slide.made, slide.lost, slide.fees, 1);
      const rows = [
        { label: "Made", value: slide.made, good: true, sub: `${slide.wins} winner${slide.wins === 1 ? "" : "s"}` },
        { label: "Gave back", value: -slide.lost, good: false, sub: `${slide.losses} loser${slide.losses === 1 ? "" : "s"}` },
        { label: "Fees took", value: -slide.fees, good: false, sub: "commission & exchange" },
      ];
      return (
        <Stage className="gap-[clamp(2rem,6vh,4rem)]">
          <Item>
            <Statement>
              Follow the <em>money</em>.
            </Statement>
          </Item>
          <div className="w-full max-w-4xl">
            {rows.map((r, i) => (
              <Item key={r.label} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-x-6 border-t border-line py-[clamp(1rem,2.6vh,1.6rem)]">
                <Cap className="!text-ink-2">{r.label}</Cap>
                <div className="flex items-center gap-4">
                  <Fill pct={Math.abs(r.value) / max} good={r.good} delay={0.5 + i * 0.15} />
                  <span className="hidden shrink-0 font-mono text-[10px] text-ink-4 sm:inline">{r.sub}</span>
                </div>
                <Money v={r.value} className="text-[clamp(1.2rem,2.4vw,2rem)] font-light" />
              </Item>
            ))}
            <Item className="flex items-baseline justify-between border-y border-line py-[clamp(1.2rem,3vh,2rem)]">
              <span className="font-serif text-[clamp(1.4rem,2.6vw,2.2rem)] font-light italic">You kept</span>
              <Money v={slide.net} className="text-[clamp(2rem,4.6vw,3.8rem)] font-light" />
            </Item>
          </div>
        </Stage>
      );
    }

    case "scoreboard":
      return (
        <Stage className="gap-[clamp(2rem,6vh,4rem)]">
          <Item>
            <Statement>
              The numbers that <em>matter</em>.
            </Statement>
          </Item>
          <div className="grid w-full max-w-5xl grid-cols-2 gap-x-[clamp(1.5rem,4vw,3rem)] gap-y-10 border-t border-line pt-[clamp(1.6rem,4vh,2.6rem)] lg:grid-cols-4">
            {slide.stats.map((st) => (
              <Item key={st.label}>
                <div className={cn("num text-[clamp(1.5rem,3.4vw,3rem)] leading-[1.1] font-light lg:whitespace-nowrap", st.tone === "pos" ? "text-pos" : st.tone === "neg" ? "text-neg" : "text-ink")}>{st.value}</div>
                <Cap className="mt-4">{st.label}</Cap>
                {st.delta && <div className="mt-1.5 font-mono text-[10.5px] text-ink-3">{st.delta} vs before</div>}
              </Item>
            ))}
          </div>
        </Stage>
      );

    case "curve":
      return (
        <Stage className="gap-[clamp(1.6rem,5vh,3rem)]">
          <Item>
            <Cap className="mb-6">{slide.caption}</Cap>
            <Statement>
              The <em>shape</em> of it.
            </Statement>
          </Item>
          <Item className="-mx-2 w-[calc(100%+1rem)]">
            <LivingLine values={slide.points} height={220} className="max-sm:!h-[150px]" />
          </Item>
          <Item className="grid w-full max-w-3xl grid-cols-2 gap-8 border-t border-line pt-6">
            <div>
              <Money v={slide.net} className="text-[clamp(1.6rem,3.2vw,2.6rem)] font-light" />
              <Cap className="mt-3">Finished</Cap>
            </div>
            <div>
              <span className="num text-[clamp(1.6rem,3.2vw,2.6rem)] font-light text-ink">{fmtMoney(-slide.maxDrawdown)}</span>
              <Cap className="mt-3">Deepest drawdown</Cap>
            </div>
          </Item>
        </Stage>
      );

    case "calendar": {
      const weekly = slide.days.length <= 7;
      const max = Math.max(1, ...slide.days.map((d) => Math.abs(d.net ?? 0)));
      const lead = weekly ? 0 : (new Date(`${slide.days[0]!.day}T00:00:00Z`).getUTCDay() + 6) % 7;
      return (
        <Stage className="gap-[clamp(2rem,5vh,3.5rem)]">
          <Item>
            <Statement>
              {slide.green} <em>green</em>, {slide.red} red.
            </Statement>
          </Item>
          {weekly ? (
            <Item className="grid w-full max-w-5xl grid-cols-5 items-end gap-[clamp(0.8rem,2.5vw,2rem)] border-b border-line pb-4">
              {slide.days.map((d, i) => {
                const h = d.net === null ? 0 : Math.max(0.06, Math.abs(d.net) / max);
                return (
                  <div key={d.day} className="flex flex-col items-start">
                    <div className="flex h-[clamp(7rem,22vh,12rem)] w-full items-end" data-private>
                      {d.net !== null && (
                        <motion.i
                          className={cn("block w-[2px]", d.net >= 0 ? "bg-pos shadow-[0_0_10px_rgba(116,184,156,0.6)]" : "bg-neg")}
                          initial={{ height: 0 }}
                          animate={{ height: `${h * 100}%` }}
                          transition={{ duration: 1.2, ease: EASE, delay: 0.35 + i * 0.08 }}
                        />
                      )}
                    </div>
                    <Cap className="mt-4">{longDate(d.day).split(",")[0]!.slice(0, 3)}</Cap>
                    <span className={cn("num mt-1.5 font-mono text-[clamp(11px,1.2vw,14px)]", d.net === null ? "text-ink-4" : tone(d.net))}>
                      {d.net === null ? "—" : fmtMoney(d.net, { sign: true, compact: true })}
                    </span>
                  </div>
                );
              })}
            </Item>
          ) : (
            <Item className="grid w-full max-w-xl grid-cols-7 border-t border-l border-line">
              {WEEKDAYS.map((d) => (
                <div key={d} className="border-r border-b border-line py-1.5 text-center font-mono text-[9px] tracking-[0.2em] text-ink-4">
                  {d[0]}
                </div>
              ))}
              {Array.from({ length: lead }).map((_, i) => (
                <div key={`p${i}`} className="border-r border-b border-line" />
              ))}
              {slide.days.map((d, i) => (
                <motion.div
                  key={d.day}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 + i * 0.02 }}
                  data-private
                  className="relative aspect-square border-r border-b border-line p-1.5 font-mono text-[9px] text-ink-4"
                >
                  {Number(d.day.slice(8))}
                  {d.net !== null && (
                    <i
                      className={cn("absolute bottom-1.5 left-1.5 block w-[2px]", d.net >= 0 ? "bg-pos" : "bg-neg")}
                      style={{ height: `${Math.max(10, (Math.abs(d.net) / max) * 55)}%` }}
                    />
                  )}
                </motion.div>
              ))}
            </Item>
          )}
        </Stage>
      );
    }

    case "trade": {
      const t = slide.trade;
      const best = slide.variant === "best";
      return (
        <Stage className="gap-[clamp(1.6rem,5vh,3rem)]">
          <Item>
            <Statement>
              {best ? (
                <>
                  The one you <em>nailed</em>.
                </>
              ) : (
                <>
                  The one that <em>hurt</em>.
                </>
              )}
            </Statement>
          </Item>
          <Item className="flex flex-wrap items-end justify-between gap-8 border-t border-line pt-[clamp(1.4rem,4vh,2.4rem)]">
            <div>
              <div className="font-mono text-[clamp(1.4rem,2.6vw,2.2rem)] tracking-[0.06em] text-ink">
                {t.symbol} <span className="text-[0.5em] tracking-[0.24em] text-ink-3 uppercase">{t.direction === "long" ? "▲ long" : "▼ short"} ×{t.qty}</span>
              </div>
              <Cap className="mt-3">
                {longDate(t.day).split(",")[0]} · {t.time} · held {fmtHold(t.hold)}
              </Cap>
            </div>
            <Odometer value={t.netPnl} delay={400} className="text-[clamp(2.6rem,7vw,5.6rem)] leading-none font-light" />
          </Item>
          <Item className="grid w-full max-w-3xl grid-cols-2 gap-8 font-mono text-[12px] text-ink-2 sm:grid-cols-3">
            <div>
              <Cap className="mb-2">Entry</Cap>
              <span className="num">{fmtPrice(t.entryPrice)}</span>
            </div>
            <div>
              <Cap className="mb-2">Exit</Cap>
              <span className="num">{fmtPrice(t.exitPrice)}</span>
            </div>
            {(t.setup || t.mistakes.length > 0) && (
              <div className="col-span-2 sm:col-span-1">
                <Cap className="mb-2">Tagged</Cap>
                {[t.setup, ...t.mistakes].filter(Boolean).join(" · ")}
              </div>
            )}
          </Item>
          {t.notes && (
            <Item>
              <p className="max-w-[40ch] border-l border-gold pl-6 font-serif text-[clamp(1.2rem,2.2vw,1.7rem)] leading-[1.45] font-light italic">“{t.notes}”</p>
            </Item>
          )}
        </Stage>
      );
    }

    case "insight": {
      const edge = slide.variant === "edge";
      const i = slide.insight;
      return (
        <Stage className="gap-[clamp(1.6rem,5vh,3rem)]">
          <Item>
            <Cap className="mb-6 !text-gold">{edge ? "◆ Your edge" : "◆ Your leak"}</Cap>
            <Statement size="md">{i.title.replace(/\.$/, "")}.</Statement>
          </Item>
          <Item>
            <Body>{i.detail}</Body>
          </Item>
          <Item>
            <Cap>
              {i.confidence} confidence · {edge ? "do more of this" : "this is the fix that pays"}
            </Cap>
          </Item>
        </Stage>
      );
    }

    case "discipline": {
      const rings = [
        { k: "Prepared", v: slide.rings.prepare },
        { k: "Disciplined", v: slide.rings.discipline },
        { k: "Reflected", v: slide.rings.reflect },
      ];
      return (
        <Stage className="gap-[clamp(1.8rem,5vh,3.2rem)]">
          <Item>
            <Statement>
              {slide.violations.length ? (
                <>
                  Where the rules <em>bent</em>.
                </>
              ) : (
                <>
                  A <em>clean</em> sheet.
                </>
              )}
            </Statement>
          </Item>
          <Item className="grid w-full max-w-4xl gap-x-10 gap-y-6 sm:grid-cols-3">
            {rings.map((r, i) => (
              <div key={r.k}>
                <div className="mb-3 flex items-baseline justify-between">
                  <Cap>{r.k}</Cap>
                  <span className="num font-mono text-[13px] text-ink">{Math.round(r.v * 100)}%</span>
                </div>
                <Fill pct={r.v} good={r.v >= 0.7} delay={0.4 + i * 0.12} />
              </div>
            ))}
          </Item>
          <Item className="w-full max-w-4xl">
            {slide.violations.length === 0 ? (
              <Body>Every trade stayed inside your rules. That&apos;s the job done; the P&amp;L follows.</Body>
            ) : (
              <div className="border-t border-line">
                {slide.violations.slice(0, 4).map((v, i) => (
                  <div key={v.label} className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-4 border-b border-line py-3.5">
                    <span className="font-mono text-[10.5px] text-gold">{String(i + 1).padStart(2, "0")}</span>
                    <span className="font-serif text-[clamp(1.05rem,1.8vw,1.4rem)] font-light">
                      {v.label} <span className="font-mono text-[11px] text-ink-4">×{v.count}</span>
                    </span>
                    <Money v={v.pnl} className="font-mono text-[13px]" />
                  </div>
                ))}
              </div>
            )}
            <Cap className="mt-5">
              {slide.streak}-day streak{slide.tiltCount > 0 && <> · {slide.tiltCount} revenge-style trade{slide.tiltCount === 1 ? "" : "s"} netted {fmtMoney(slide.tiltCost, { sign: true })}</>}
            </Cap>
          </Item>
        </Stage>
      );
    }

    case "mind": {
      const r = slide.readiness;
      const score = r ? Math.round(((r.sleep + r.energy + r.focus + r.mood - 4) / 16) * 100) : null;
      return (
        <Stage className="gap-[clamp(1.8rem,5vh,3.2rem)]">
          <Item>
            <Statement>
              {score === null ? (
                <>
                  No check-in <em>logged</em>.
                </>
              ) : score >= 70 ? (
                <>
                  You showed up <em>sharp</em>.
                </>
              ) : score >= 45 ? (
                <>
                  You showed up <em>level</em>.
                </>
              ) : (
                <>
                  Running on <em>fumes</em>.
                </>
              )}
            </Statement>
          </Item>
          {r && (
            <Item className="grid w-full max-w-4xl grid-cols-4 gap-6 border-t border-line pt-6">
              {(["sleep", "energy", "focus", "mood"] as const).map((k) => (
                <div key={k}>
                  <div className="num text-[clamp(2rem,4.4vw,3.6rem)] leading-none font-light">
                    {r[k]}
                    <span className="ml-1 text-[0.4em] text-gold">/5</span>
                  </div>
                  <Cap className="mt-3">{k}</Cap>
                </div>
              ))}
            </Item>
          )}
          <Item className="w-full max-w-4xl">
            <div className="mb-3 flex items-baseline justify-between">
              <Cap>The ritual</Cap>
              <span className="num font-mono text-[13px]">{fmtPct(slide.ritualPct)}</span>
            </div>
            <Fill pct={slide.ritualPct} good={slide.ritualPct >= 0.7} />
          </Item>
          {slide.intention && (
            <Item>
              <Cap className="mb-3">The intention</Cap>
              <p className="font-serif text-[clamp(1.3rem,2.6vw,2rem)] font-light italic">“{slide.intention}”</p>
            </Item>
          )}
        </Stage>
      );
    }

    case "reportcard": {
      const c = slide.card;
      return (
        <Stage>
          <div className="grid w-full items-center gap-x-[clamp(2rem,6vw,6rem)] gap-y-8 lg:grid-cols-[auto_1fr]">
            <Item>
              <Cap className="mb-4">Report card</Cap>
              <div className="font-serif text-[clamp(7rem,20vw,15rem)] leading-[0.8] font-light tracking-[-0.04em] italic">{c.grade}</div>
            </Item>
            <Item className="border-t border-line">
              {c.dimensions.map((d, i) => (
                <div key={d.key} className="border-b border-line py-[clamp(0.7rem,1.8vh,1.1rem)]">
                  <div className="mb-2.5 flex items-baseline justify-between">
                    <span className="font-serif text-[clamp(1.05rem,1.8vw,1.4rem)] font-light">{d.label}</span>
                    <span className="font-mono text-[12px]">
                      {d.grade} <span className="text-ink-4">· {d.score}</span>
                    </span>
                  </div>
                  <Fill pct={d.score / 100} good={d.score >= 70} delay={0.4 + i * 0.1} />
                </div>
              ))}
              <Cap className="mt-5 normal-case !tracking-[0.06em]">
                Weighted toward process: discipline, risk and patience count more than P&amp;L.{c.lowSample ? " Small sample, directional only." : ""}
              </Cap>
            </Item>
          </div>
        </Stage>
      );
    }

    case "guardian":
      return (
        <Stage className="gap-[clamp(1.6rem,4vh,2.8rem)]">
          <Item>
            <Statement>
              {slide.cushionPct < 0.35 ? (
                <>
                  The cushion is <em>thin</em>.
                </>
              ) : (
                <>
                  The account is <em>safe</em>.
                </>
              )}
            </Statement>
          </Item>
          <Item className="w-full">
            <LimitLine closeness={1 - slide.cushionPct} label="MAX LOSS" height={110} />
          </Item>
          <Item className="grid w-full max-w-5xl grid-cols-2 gap-x-8 gap-y-8 border-t border-line pt-6 lg:grid-cols-4">
            <div>
              <span className="num text-[clamp(1.6rem,3vw,2.6rem)] font-light">{fmtMoney(slide.cushion)}</span>
              <Cap className="mt-3">Above max loss</Cap>
            </div>
            {slide.targetProgress !== null && (
              <div>
                <span className="num text-[clamp(1.6rem,3vw,2.6rem)] font-light">{fmtPct(slide.targetProgress)}</span>
                <Cap className="mt-3">Of the target</Cap>
              </div>
            )}
            {slide.passProb !== null && (
              <div>
                <span className="num text-[clamp(1.6rem,3vw,2.6rem)] font-light text-pos">{fmtPct(slide.passProb)}</span>
                <Cap className="mt-3">Chance to pass</Cap>
              </div>
            )}
            {slide.bustProb !== null && (
              <div>
                <span className="num text-[clamp(1.6rem,3vw,2.6rem)] font-light">{fmtPct(slide.bustProb)}</span>
                <Cap className="mt-3">Risk of ruin · 30d</Cap>
              </div>
            )}
          </Item>
          {slide.cushionPct < 0.35 && <Body>Size down until there&apos;s room again. The account outlives the setup.</Body>}
        </Stage>
      );

    case "ai":
      return <AiSlide ai={ai} period={w.period} />;

    case "capsule": {
      const days = Math.max(1, Math.round((Date.now() - new Date(slide.capsule.createdAt).getTime()) / 86_400_000));
      return (
        <Stage className="gap-[clamp(1.6rem,5vh,3rem)]">
          <Item>
            <Cap className="mb-6 !text-gold">◆ Sealed {days} days ago</Cap>
            <Statement size="md">
              A letter from <em>you</em>.
            </Statement>
          </Item>
          <Item>
            <p className="max-w-[34ch] border-l border-gold pl-[clamp(1.2rem,3vw,2rem)] font-serif text-[clamp(1.3rem,2.6vw,2.1rem)] leading-[1.5] font-light whitespace-pre-wrap italic">
              {slide.capsule.message}
            </p>
          </Item>
        </Stage>
      );
    }

    case "observer":
      return (
        <Stage className="gap-[clamp(1.6rem,5vh,3rem)]">
          <Item>
            <Cap className="mb-6">From the outside · watching {slide.name}</Cap>
            <Statement size="md">{slide.headline}</Statement>
          </Item>
          {slide.doing && (
            <Item>
              <Body>{slide.doing}</Body>
            </Item>
          )}
          {slide.tell && (
            <Item className="max-w-3xl border-t border-line pt-6">
              <Cap className="mb-4 !text-gold">What you&apos;d tell {slide.name}</Cap>
              <p className="font-serif text-[clamp(1.3rem,2.6vw,2rem)] leading-[1.4] font-light">
                When <em>{slide.tell.when}</em>, {slide.tell.then}
              </p>
            </Item>
          )}
        </Stage>
      );

    case "focus":
      return (
        <Stage className="gap-[clamp(1.6rem,5vh,3rem)]">
          <Item>
            <Cap className="mb-6 !text-gold">◆ Next session, one thing</Cap>
            <Statement size="md">{slide.text}</Statement>
          </Item>
          <Item>
            <Body>{slide.why}</Body>
          </Item>
        </Stage>
      );

    case "outro":
      return (
        <Stage className="gap-[clamp(2rem,6vh,4rem)]">
          <Item>
            <Statement size="xl">
              That&apos;s the <em>{unit(w.period)}</em>.
            </Statement>
          </Item>
          <Item>
            <Cap>
              <Dot className="mr-2" /> {slide.streak}-day streak · the journal is waiting
            </Cap>
          </Item>
          <Item className="flex flex-wrap items-center gap-x-8 gap-y-5">
            <Link
              href={`/journal/${slide.day}`}
              className="inline-flex h-[52px] items-center border border-ink bg-ink px-8 font-mono text-[11px] tracking-[0.26em] text-bg uppercase transition-colors duration-300 hover:bg-transparent hover:text-ink"
            >
              Write it down
            </Link>
            <button onClick={onReplay} className="font-mono text-[10px] tracking-[0.3em] text-ink-3 uppercase hover:text-ink">
              ↺ Replay
            </button>
            {(["daily", "weekly", "monthly"] as const)
              .filter((p) => p !== w.period)
              .map((p) => (
                <Link key={p} href={`/briefing/${p}`} className="font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase hover:text-ink">
                  The {unit(p)} →
                </Link>
              ))}
          </Item>
        </Stage>
      );
  }
}

function AiSlide({ ai, period }: { ai: AiState; period: string }) {
  if (ai.status === "loading") {
    return (
      <Stage className="gap-8">
        <Item>
          <Cap className="mb-6 !text-gold">
            <Dot tone="gold" className="mr-2" /> The coach is reading
          </Cap>
          <Statement>
            Reviewing your <em>{unit(period)}</em>…
          </Statement>
        </Item>
        <Item className="w-full max-w-xl space-y-4">
          {[92, 100, 76, 88].map((wd, i) => (
            <div key={i} className="relative h-px overflow-hidden bg-line" style={{ width: `${wd}%` }}>
              <motion.i className="absolute inset-y-0 block w-1/4 bg-ink-3" animate={{ x: ["-100%", "400%"] }} transition={{ duration: 1.8, repeat: Infinity, ease: EASE, delay: i * 0.15 }} />
            </div>
          ))}
        </Item>
      </Stage>
    );
  }
  if (ai.status === "disabled") {
    return (
      <Stage className="gap-8">
        <Item>
          <Cap className="mb-6">The coach</Cap>
          <Statement>
            The coach needs a <em>key</em>.
          </Statement>
        </Item>
        <Item>
          <Body>Add ANTHROPIC_API_KEY in Vercel and this becomes a personal debrief: a verdict, what went well, what to fix, and the one thing for tomorrow.</Body>
        </Item>
      </Stage>
    );
  }
  if (ai.status === "error") {
    return (
      <Stage className="gap-8">
        <Item>
          <Statement>
            The coach is <em>quiet</em>.
          </Statement>
        </Item>
        <Item>
          <Body>{ai.message}</Body>
        </Item>
      </Stage>
    );
  }
  const d = ai.data;
  return (
    <Stage className="min-h-0 justify-start gap-[clamp(1.2rem,3vh,2rem)] overflow-y-auto py-2" >
      <Item className="flex items-start justify-between gap-8">
        <div>
          <Cap className="mb-5 !text-gold">◆ The coach</Cap>
          <Statement size="md">{d.headline}</Statement>
        </div>
        <span className="shrink-0 font-serif text-[clamp(3.5rem,8vw,6rem)] leading-none font-light italic">{d.grade}</span>
      </Item>
      <Item>
        <Body className="max-w-[64ch]">{d.verdict}</Body>
      </Item>
      <Item className="grid w-full max-w-5xl gap-x-12 gap-y-6 md:grid-cols-2">
        <div className="border-t border-line">
          <Cap className="py-3">Went well</Cap>
          {d.wentWell.slice(0, 3).map((x) => (
            <p key={x} className="border-t border-line py-2.5 font-mono text-[11.5px] leading-[1.8] text-ink-2">
              <span className="mr-2 text-pos">●</span>
              {x}
            </p>
          ))}
        </div>
        <div className="border-t border-line">
          <Cap className="py-3">To fix</Cap>
          {d.toImprove.slice(0, 3).map((x) => (
            <p key={x} className="border-t border-line py-2.5 font-mono text-[11.5px] leading-[1.8] text-ink-2">
              <span className="mr-2 text-gold">→</span>
              {x}
            </p>
          ))}
        </div>
      </Item>
      <Item className="max-w-3xl border-l border-gold pl-6">
        <Cap className="mb-2 !text-gold">One thing</Cap>
        <p className="font-serif text-[clamp(1.2rem,2.2vw,1.7rem)] leading-[1.35] font-light">{d.oneThing}</p>
        <p className="mt-4 font-serif text-[1.05rem] font-light text-ink-3 italic">{d.question}</p>
      </Item>
    </Stage>
  );
}
