"use client";

import Link from "next/link";
import { motion, type Variants } from "motion/react";
import {
  ArrowRight, BookOpen, Check, CircleCheckBig, Flame, Mail, RotateCcw, ShieldCheck, Sparkles, Target, TrendingDown, TrendingUp,
  TriangleAlert, Trophy, Zap,
} from "lucide-react";
import type { BriefingWindow, Slide } from "@/lib/analytics/briefing";
import type { AiBriefing } from "@/lib/ai/briefing";
import { cn } from "@/lib/cn";
import { fmtMoney, fmtPct, fmtPrice } from "@/lib/format";
import { fmtHold, longDate, WEEKDAYS } from "@/lib/analytics/time";
import { NumberTicker } from "@/components/ui/NumberTicker";
import { Rings } from "@/components/ui/Rings";
import { LogoMark } from "@/components/ui/Logo";
import { AreaChart } from "@/components/charts/AreaChart";
import { Gauge } from "@/components/charts/Gauge";
import { RING_COLORS } from "@/components/today/TraderRings";

export type AiState =
  | { status: "loading" }
  | { status: "disabled" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AiBriefing };

const POS = "#30d158", NEG = "#ff453a";

export function slideTheme(s: Slide): [string, string] {
  switch (s.kind) {
    case "cover": return s.rest ? ["#5e5ce6", "#64d2ff"] : s.net >= 0 ? ["#5e5ce6", "#30d158"] : ["#5e5ce6", "#ff375f"];
    case "money": return s.net >= 0 ? ["#30d158", "#66d4cf"] : ["#ff453a", "#ff9f0a"];
    case "scoreboard": return ["#0a84ff", "#5e5ce6"];
    case "curve": return s.net >= 0 ? ["#30d158", "#0a84ff"] : ["#ff453a", "#5e5ce6"];
    case "calendar": return ["#40c8e0", "#5e5ce6"];
    case "trade": return s.variant === "best" ? ["#30d158", "#ffd60a"] : ["#ff453a", "#bf5af2"];
    case "insight": return s.variant === "edge" ? ["#66d4cf", "#30d158"] : ["#ff9f0a", "#ff375f"];
    case "discipline": return ["#bf5af2", "#5e5ce6"];
    case "mind": return ["#ffd60a", "#ff9f0a"];
    case "reportcard": return ["#5e5ce6", "#64d2ff"];
    case "guardian": return ["#0a84ff", "#30d158"];
    case "ai": return ["#bf5af2", "#64d2ff"];
    case "capsule": return ["#ff9f0a", "#ffd60a"];
    case "focus": return ["#ffd60a", "#ff375f"];
    case "outro": return ["#64d2ff", "#bf5af2"];
  }
}

const stage: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } } };
const rise: Variants = {
  hidden: { opacity: 0, y: 22, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.75, ease: [0.16, 1, 0.3, 1] } },
};

function Stage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={stage} initial="hidden" animate="show" className={cn("flex h-full min-h-0 flex-col", className)}>
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
function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="mb-2 text-[11.5px] font-bold tracking-[0.14em] uppercase" style={{ color: color ?? "rgba(255,255,255,0.6)" }}>
      {children}
    </div>
  );
}
function Headline({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("font-[family-name:var(--font-display)] text-[32px] leading-[1.02] font-bold tracking-[-0.035em] text-white sm:text-[36px]", className)}>{children}</h2>;
}
const pnlColor = (n: number) => (n > 0 ? "text-pos" : n < 0 ? "text-neg" : "text-white");

export function SlideView({ slide, ai, window: w, onReplay }: { slide: Slide; ai: AiState; window: BriefingWindow; onReplay: () => void }) {
  switch (slide.kind) {
    case "cover":
      return (
        <Stage className="justify-between">
          <Item>
            <Eyebrow>{w.period} briefing</Eyebrow>
            <h1 className="font-[family-name:var(--font-display)] text-[54px] leading-[0.92] font-bold tracking-[-0.05em] text-white sm:text-[60px]">{slide.title}</h1>
            <div className="mt-2 text-[15px] text-white/60">{slide.label}</div>
          </Item>
          <Item>
            {slide.rest ? (
              <>
                <div className="font-[family-name:var(--font-display)] text-[44px] leading-none font-bold tracking-[-0.04em] text-white">Rest day.</div>
                <p className="mt-3 max-w-[18rem] text-[16px] leading-relaxed text-white/70">No trades. Your edge stays sharp when you protect it.</p>
              </>
            ) : (
              <>
                <div className="text-[12px] font-semibold tracking-[0.14em] text-white/55 uppercase">Net P&amp;L</div>
                <div className={cn("mt-1 text-[68px] leading-none font-bold tracking-[-0.055em] sm:text-[76px]", pnlColor(slide.net))}>
                  <NumberTicker value={slide.net} duration={1.6} />
                </div>
                <div className="mt-3 text-[15px] text-white/70">
                  {slide.trades} trade{slide.trades === 1 ? "" : "s"} · {fmtPct(slide.winRate)} win rate
                </div>
              </>
            )}
          </Item>
          <Item className="flex items-center gap-2.5 text-[12.5px] text-white/50">
            <LogoMark size={22} /> Tap to continue <ArrowRight size={14} />
          </Item>
        </Stage>
      );

    case "money": {
      const max = Math.max(slide.made, slide.lost, slide.fees, 1);
      const rows = [
        { label: "You made", value: slide.made, color: POS, sub: `${slide.wins} winning trade${slide.wins === 1 ? "" : "s"}` },
        { label: "You gave back", value: slide.lost, color: NEG, sub: `${slide.losses} losing trade${slide.losses === 1 ? "" : "s"}` },
        { label: "Fees took", value: slide.fees, color: "#ff9f0a", sub: "commissions & exchange" },
      ];
      return (
        <Stage className="justify-center gap-7">
          <Item>
            <Eyebrow>Follow the money</Eyebrow>
            <Headline>Here&apos;s where it went.</Headline>
          </Item>
          {rows.map((r, i) => (
            <Item key={r.label}>
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] text-white/70">{r.label}</span>
                <span className="num text-[26px] font-bold tracking-[-0.03em]" style={{ color: r.color }}>
                  {fmtMoney(r.value)}
                </span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: r.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(r.value / max) * 100}%` }}
                  transition={{ type: "spring", stiffness: 60, damping: 16, delay: 0.4 + i * 0.15 }}
                />
              </div>
              <div className="mt-1 text-[12px] text-white/45">{r.sub}</div>
            </Item>
          ))}
          <Item className="border-t border-white/15 pt-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-semibold text-white">You kept</span>
              <span className={cn("num text-[40px] font-bold tracking-[-0.04em]", pnlColor(slide.net))}>{fmtMoney(slide.net, { sign: true })}</span>
            </div>
          </Item>
        </Stage>
      );
    }

    case "scoreboard":
      return (
        <Stage className="justify-center gap-6">
          <Item>
            <Eyebrow>Scoreboard</Eyebrow>
            <Headline>The numbers that matter.</Headline>
          </Item>
          <div className="grid grid-cols-2 gap-3">
            {slide.stats.map((st) => (
              <Item key={st.label} className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                <div className="text-[12px] font-medium text-white/55">{st.label}</div>
                <div className={cn("num mt-1.5 text-[24px] leading-tight font-bold tracking-[-0.03em]", st.tone === "pos" ? "text-pos" : st.tone === "neg" ? "text-neg" : "text-white")}>
                  {st.value}
                </div>
                {st.delta && <div className={cn("mt-1 text-[11.5px] font-semibold", st.delta.startsWith("▲") ? "text-pos/80" : "text-neg/80")}>{st.delta} vs prior</div>}
              </Item>
            ))}
          </div>
        </Stage>
      );

    case "curve":
      return (
        <Stage className="justify-center gap-6">
          <Item>
            <Eyebrow>{slide.caption}</Eyebrow>
            <Headline>The shape of it.</Headline>
          </Item>
          <Item className="-mx-2">
            <AreaChart series={[{ values: slide.points }]} height={240} interactive={false} />
          </Item>
          <Item className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[12px] text-white/55">Finished</div>
              <div className={cn("num text-[28px] font-bold tracking-[-0.03em]", pnlColor(slide.net))}>{fmtMoney(slide.net, { sign: true })}</div>
            </div>
            <div>
              <div className="text-[12px] text-white/55">Deepest drawdown</div>
              <div className="num text-[28px] font-bold tracking-[-0.03em] text-white">{fmtMoney(-slide.maxDrawdown)}</div>
            </div>
          </Item>
        </Stage>
      );

    case "calendar": {
      const weekly = slide.days.length <= 7;
      const max = Math.max(1, ...slide.days.map((d) => Math.abs(d.net ?? 0)));
      return (
        <Stage className="justify-center gap-6">
          <Item>
            <Eyebrow>Day by day</Eyebrow>
            <Headline>
              {slide.green} green, {slide.red} red.
            </Headline>
          </Item>
          <Item className={cn("grid gap-1.5", weekly ? "grid-cols-1" : "grid-cols-7")}>
            {!weekly &&
              WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-[10px] font-bold text-white/40">
                  {d[0]}
                </div>
              ))}
            {!weekly && Array.from({ length: (new Date(`${slide.days[0]!.day}T00:00:00Z`).getUTCDay() + 6) % 7 }).map((_, i) => <div key={`p${i}`} />)}
            {slide.days.map((d, i) => {
              const a = d.net === null ? 0 : 0.25 + (Math.abs(d.net) / max) * 0.65;
              const bg = d.net === null ? "rgba(255,255,255,0.05)" : d.net >= 0 ? `rgba(48,209,88,${a})` : `rgba(255,69,58,${a})`;
              return weekly ? (
                <motion.div
                  key={d.day}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.07 }}
                  className="flex items-center justify-between rounded-2xl px-4 py-3"
                  style={{ background: bg }}
                >
                  <span className="text-[14px] font-semibold text-white">{longDate(d.day).split(",")[0]}</span>
                  <span className="num text-[15px] font-bold text-white">{d.net === null ? "—" : fmtMoney(d.net, { sign: true })}</span>
                </motion.div>
              ) : (
                <motion.div
                  key={d.day}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + i * 0.02 }}
                  className="grid aspect-square place-items-center rounded-lg text-[10px] font-semibold text-white/80"
                  style={{ background: bg }}
                >
                  {Number(d.day.slice(8))}
                </motion.div>
              );
            })}
          </Item>
        </Stage>
      );
    }

    case "trade": {
      const t = slide.trade;
      const best = slide.variant === "best";
      return (
        <Stage className="justify-center gap-6">
          <Item>
            <Eyebrow color={best ? POS : NEG}>{best ? "Trade of the period" : "The one that hurt"}</Eyebrow>
            <Headline>{best ? "Your best trade." : "Your toughest trade."}</Headline>
          </Item>
          <Item className="rounded-[28px] border border-white/10 bg-white/[0.07] p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("grid h-11 w-11 place-items-center rounded-2xl", t.direction === "long" ? "bg-pos/20 text-pos" : "bg-neg/20 text-neg")}>
                  {t.direction === "long" ? <TrendingUp size={21} /> : <TrendingDown size={21} />}
                </div>
                <div>
                  <div className="text-[19px] font-bold text-white">{t.symbol}</div>
                  <div className="text-[12.5px] text-white/55">
                    {t.direction === "long" ? "Long" : "Short"} {t.qty} · {longDate(t.day).split(",")[0]} {t.time}
                  </div>
                </div>
              </div>
            </div>
            <div className={cn("num mt-5 text-[54px] leading-none font-bold tracking-[-0.05em]", pnlColor(t.netPnl))}>
              <NumberTicker value={t.netPnl} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
              <div>
                <div className="text-white/45">Entry</div>
                <div className="num font-semibold text-white">{fmtPrice(t.entryPrice)}</div>
              </div>
              <div>
                <div className="text-white/45">Exit</div>
                <div className="num font-semibold text-white">{fmtPrice(t.exitPrice)}</div>
              </div>
              <div>
                <div className="text-white/45">Held</div>
                <div className="num font-semibold text-white">{fmtHold(t.hold)}</div>
              </div>
            </div>
            {(t.setup || t.mistakes.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {t.setup && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-semibold text-white/85">{t.setup}</span>}
                {t.mistakes.map((m) => (
                  <span key={m} className="rounded-full bg-neg/20 px-2.5 py-1 text-[11.5px] font-semibold text-neg">
                    {m}
                  </span>
                ))}
              </div>
            )}
          </Item>
          {t.notes && (
            <Item>
              <p className="text-[15px] leading-relaxed text-white/75 italic">“{t.notes}”</p>
            </Item>
          )}
        </Stage>
      );
    }

    case "insight": {
      const edge = slide.variant === "edge";
      const i = slide.insight;
      return (
        <Stage className="justify-center gap-5">
          <Item>
            <div className={cn("mb-5 grid h-14 w-14 place-items-center rounded-2xl", edge ? "bg-mint/20 text-mint" : "bg-orange/20 text-orange")}>
              {edge ? <Trophy size={26} /> : <TriangleAlert size={26} />}
            </div>
            <Eyebrow color={edge ? "#66d4cf" : "#ff9f0a"}>{edge ? "Your edge" : "Your leak"}</Eyebrow>
            <Headline className="text-[34px] sm:text-[38px]">{i.title}.</Headline>
          </Item>
          <Item>
            <p className="text-[16.5px] leading-relaxed text-white/75">{i.detail}</p>
          </Item>
          <Item className="flex items-center gap-2 text-[12px] text-white/50">
            <span className="rounded-full bg-white/10 px-2.5 py-1 font-semibold capitalize">{i.confidence} confidence</span>
            {edge ? "Do more of this." : "This is the fix that pays."}
          </Item>
        </Stage>
      );
    }

    case "discipline":
      return (
        <Stage className="justify-center gap-6">
          <Item>
            <Eyebrow color="#bf5af2">Discipline</Eyebrow>
            <Headline>{slide.violations.length ? "Where the rules bent." : "Clean sheet."}</Headline>
          </Item>
          <Item className="flex items-center gap-5">
            <Rings
              size={120}
              stroke={12}
              gap={3}
              rings={[
                { value: slide.rings.prepare, color: RING_COLORS.prepare },
                { value: slide.rings.discipline, color: RING_COLORS.discipline },
                { value: slide.rings.reflect, color: RING_COLORS.reflect },
              ]}
            />
            <div className="space-y-1 text-[13px]">
              <div style={{ color: RING_COLORS.prepare }}>Prepare {Math.round(slide.rings.prepare * 100)}%</div>
              <div style={{ color: RING_COLORS.discipline }}>Discipline {Math.round(slide.rings.discipline * 100)}%</div>
              <div style={{ color: RING_COLORS.reflect }}>Reflect {Math.round(slide.rings.reflect * 100)}%</div>
              <div className="flex items-center gap-1 pt-1 font-semibold text-orange">
                <Flame size={13} /> {slide.streak}-day streak
              </div>
            </div>
          </Item>
          <Item className="space-y-2">
            {slide.violations.length === 0 ? (
              <p className="text-[15.5px] leading-relaxed text-white/75">Every trade stayed inside your rules. That&apos;s the job done — the P&amp;L follows.</p>
            ) : (
              slide.violations.slice(0, 4).map((v) => (
                <div key={v.label} className="flex items-center justify-between rounded-2xl bg-white/[0.06] px-4 py-3">
                  <span className="text-[14px] text-white/85">
                    {v.label} <span className="text-white/40">×{v.count}</span>
                  </span>
                  <span className={cn("num text-[14px] font-bold", pnlColor(v.pnl))}>{fmtMoney(v.pnl, { sign: true })}</span>
                </div>
              ))
            )}
            {slide.tiltCount > 0 && (
              <div className="pt-1 text-[13px] text-white/55">
                {slide.tiltCount} revenge-style trade{slide.tiltCount === 1 ? "" : "s"} netted {fmtMoney(slide.tiltCost, { sign: true })}.
              </div>
            )}
          </Item>
        </Stage>
      );

    case "mind": {
      const r = slide.readiness;
      const score = r ? Math.round(((r.sleep + r.energy + r.focus + r.mood - 4) / 16) * 100) : null;
      return (
        <Stage className="justify-center gap-6">
          <Item>
            <Eyebrow color="#ffd60a">Mind before market</Eyebrow>
            <Headline>{score === null ? "No check-in logged." : score >= 70 ? "You showed up sharp." : score >= 45 ? "You showed up OK." : "You showed up running on fumes."}</Headline>
          </Item>
          {r && (
            <Item className="grid grid-cols-4 gap-2">
              {(["sleep", "energy", "focus", "mood"] as const).map((k) => (
                <div key={k} className="rounded-2xl bg-white/[0.07] p-3 text-center">
                  <div className="num text-[24px] font-bold text-white">{r[k]}</div>
                  <div className="text-[10.5px] font-semibold tracking-wider text-white/50 uppercase">{k}</div>
                </div>
              ))}
            </Item>
          )}
          <Item>
            <div className="flex items-baseline justify-between text-[14px]">
              <span className="text-white/65">Daily ritual</span>
              <span className="num font-bold text-white">{fmtPct(slide.ritualPct)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full rounded-full bg-yellow" initial={{ width: 0 }} animate={{ width: `${slide.ritualPct * 100}%` }} transition={{ delay: 0.5, type: "spring", stiffness: 60, damping: 15 }} />
            </div>
          </Item>
          {slide.intention && (
            <Item>
              <div className="text-[12px] text-white/50">Your intention</div>
              <p className="mt-1 text-[18px] leading-snug font-semibold text-white">“{slide.intention}”</p>
            </Item>
          )}
        </Stage>
      );
    }

    case "reportcard": {
      const c = slide.card;
      return (
        <Stage className="justify-center gap-5">
          <Item className="flex items-end justify-between">
            <div>
              <Eyebrow>Report card</Eyebrow>
              <Headline>What you&apos;re judged on.</Headline>
            </div>
            <div className="text-brand font-[family-name:var(--font-display)] text-[72px] leading-[0.85] font-black tracking-[-0.05em]">{c.grade}</div>
          </Item>
          <Item className="space-y-3">
            {c.dimensions.map((d, i) => (
              <div key={d.key}>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="font-semibold text-white/85">{d.label}</span>
                  <span className="num font-bold text-white">
                    {d.grade} <span className="font-medium text-white/40">· {d.score}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="bg-brand h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${d.score}%` }}
                    transition={{ delay: 0.4 + i * 0.1, type: "spring", stiffness: 60, damping: 15 }}
                  />
                </div>
              </div>
            ))}
          </Item>
          <Item className="text-[12px] leading-relaxed text-white/45">
            Weighted toward process — discipline, risk and patience count more than P&amp;L.{c.lowSample ? " Small sample: treat as directional." : ""}
          </Item>
        </Stage>
      );
    }

    case "guardian":
      return (
        <Stage className="justify-center gap-6">
          <Item>
            <Eyebrow color="#0a84ff">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={13} /> Prop Guardian
              </span>
            </Eyebrow>
            <Headline>{slide.cushionPct < 0.35 ? "Cushion is thin. Size down." : "Your account is safe."}</Headline>
          </Item>
          <Item className="flex justify-center">
            <Gauge value={slide.cushionPct} size={210} stroke={15}>
              <div className="text-center">
                <div className="num text-[30px] font-bold tracking-[-0.03em] text-white">{fmtMoney(slide.cushion)}</div>
                <div className="text-[12px] text-white/55">above max loss</div>
              </div>
            </Gauge>
          </Item>
          <Item className="grid grid-cols-2 gap-3">
            {slide.passProb !== null && (
              <div className="rounded-2xl bg-white/[0.07] p-4">
                <div className="text-[12px] text-white/55">Pass probability</div>
                <div className="num text-[26px] font-bold text-pos">{fmtPct(slide.passProb)}</div>
              </div>
            )}
            {slide.bustProb !== null && (
              <div className="rounded-2xl bg-white/[0.07] p-4">
                <div className="text-[12px] text-white/55">Risk of ruin (30d)</div>
                <div className={cn("num text-[26px] font-bold", slide.bustProb > 0.25 ? "text-neg" : "text-white")}>{fmtPct(slide.bustProb)}</div>
              </div>
            )}
            {slide.targetProgress !== null && (
              <div className="col-span-2 rounded-2xl bg-white/[0.07] p-4">
                <div className="flex justify-between text-[12px] text-white/55">
                  <span>Target progress</span>
                  <span className="num font-semibold text-white">{fmtPct(slide.targetProgress)}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <motion.div className="h-full rounded-full bg-pos" initial={{ width: 0 }} animate={{ width: `${slide.targetProgress * 100}%` }} transition={{ delay: 0.5 }} />
                </div>
              </div>
            )}
          </Item>
        </Stage>
      );

    case "ai":
      return <AiSlide ai={ai} period={w.period} />;

    case "capsule": {
      const days = Math.max(1, Math.round((Date.now() - new Date(slide.capsule.createdAt).getTime()) / 86_400_000));
      return (
        <Stage className="justify-center gap-6">
          <Item>
            <motion.div
              className="mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-orange/20 text-orange"
              animate={{ rotate: [0, -6, 6, 0] }}
              transition={{ duration: 1.2, delay: 0.6 }}
            >
              <Mail size={30} />
            </motion.div>
            <Eyebrow color="#ff9f0a">Time capsule</Eyebrow>
            <Headline>A note from you, {days} days ago.</Headline>
          </Item>
          <Item>
            <p className="text-[19px] leading-relaxed font-medium whitespace-pre-wrap text-white">“{slide.capsule.message}”</p>
          </Item>
        </Stage>
      );
    }

    case "focus":
      return (
        <Stage className="justify-center gap-6">
          <Item>
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-yellow/20 text-yellow">
              <Target size={26} />
            </div>
            <Eyebrow color="#ffd60a">Next session, one thing</Eyebrow>
          </Item>
          <Item>
            <p className="text-warm font-[family-name:var(--font-display)] text-[36px] leading-[1.05] font-bold tracking-[-0.035em] sm:text-[40px]">{slide.text}</p>
          </Item>
          <Item className="text-[13.5px] leading-relaxed text-white/55">Why: {slide.why}</Item>
        </Stage>
      );

    case "outro":
      return (
        <Stage className="items-center justify-center gap-6 text-center">
          <Item>
            <LogoMark size={76} glow />
          </Item>
          <Item>
            <Headline className="text-[34px]">That&apos;s your {w.period === "daily" ? "day" : w.period === "weekly" ? "week" : "month"}.</Headline>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-[14px] font-semibold text-orange">
              <Flame size={16} /> {slide.streak}-day ring streak
            </div>
          </Item>
          <Item className="flex w-full max-w-[280px] flex-col gap-2.5">
            <Link href={`/journal/${slide.day}`} className="flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-black">
              <BookOpen size={17} /> Write in the journal
            </Link>
            <button onClick={onReplay} className="flex h-12 items-center justify-center gap-2 rounded-full bg-white/10 text-[15px] font-semibold text-white">
              <RotateCcw size={16} /> Replay
            </button>
            <div className="mt-1 flex justify-center gap-2">
              {(["daily", "weekly", "monthly"] as const)
                .filter((p) => p !== w.period)
                .map((p) => (
                  <Link key={p} href={`/briefing/${p}`} className="rounded-full bg-white/[0.07] px-3.5 py-2 text-[12.5px] font-semibold text-white/75 capitalize">
                    {p} →
                  </Link>
                ))}
            </div>
          </Item>
        </Stage>
      );
  }
}

function AiSlide({ ai, period }: { ai: AiState; period: string }) {
  if (ai.status === "loading") {
    return (
      <Stage className="justify-center gap-6">
        <Item className="flex items-center gap-3">
          <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>
            <LogoMark size={44} glow />
          </motion.div>
          <div>
            <Eyebrow color="#bf5af2">Thunder · AI coach</Eyebrow>
            <div className="text-[15px] text-white/75">Reviewing your {period}…</div>
          </div>
        </Item>
        <Item className="space-y-3">
          {[92, 100, 76, 88, 60].map((w, i) => (
            <div key={i} className="skeleton h-4 rounded-full" style={{ width: `${w}%` }} />
          ))}
        </Item>
      </Stage>
    );
  }
  if (ai.status === "disabled") {
    return (
      <Stage className="justify-center gap-5">
        <Item>
          <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-purple/20 text-purple">
            <Sparkles size={26} />
          </div>
          <Eyebrow color="#bf5af2">AI coach</Eyebrow>
          <Headline>Unlock Thunder.</Headline>
        </Item>
        <Item>
          <p className="text-[15.5px] leading-relaxed text-white/70">
            Add an <span className="font-semibold text-white">ANTHROPIC_API_KEY</span> in Vercel and this slide becomes a personal coaching
            debrief: a verdict, what went well, what to fix, and the one thing to focus on next.
          </p>
        </Item>
      </Stage>
    );
  }
  if (ai.status === "error") {
    return (
      <Stage className="justify-center gap-5">
        <Item>
          <Eyebrow color="#bf5af2">AI coach</Eyebrow>
          <Headline>Thunder is offline.</Headline>
        </Item>
        <Item className="text-[15px] leading-relaxed text-white/65">{ai.message}</Item>
      </Stage>
    );
  }
  const d = ai.data;
  return (
    <Stage className="min-h-0 gap-4 overflow-y-auto">
      <Item className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow color="#bf5af2">
            <span className="inline-flex items-center gap-1.5">
              <Zap size={12} /> Thunder · AI coach
            </span>
          </Eyebrow>
          <Headline className="text-[28px] sm:text-[31px]">{d.headline}</Headline>
        </div>
        <span className="text-brand shrink-0 font-[family-name:var(--font-display)] text-[44px] leading-none font-black">{d.grade}</span>
      </Item>
      <Item>
        <p className="text-[15px] leading-relaxed text-white/80">{d.verdict}</p>
      </Item>
      <Item className="space-y-1.5">
        {d.wentWell.slice(0, 3).map((x) => (
          <div key={x} className="flex gap-2 text-[13.5px] leading-snug text-white/80">
            <CircleCheckBig size={15} className="mt-0.5 shrink-0 text-pos" /> {x}
          </div>
        ))}
        {d.toImprove.slice(0, 3).map((x) => (
          <div key={x} className="flex gap-2 text-[13.5px] leading-snug text-white/80">
            <ArrowRight size={15} className="mt-0.5 shrink-0 text-orange" /> {x}
          </div>
        ))}
      </Item>
      <Item className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
        <div className="text-[11px] font-bold tracking-[0.12em] text-yellow uppercase">One thing</div>
        <div className="mt-1 text-[16px] leading-snug font-semibold text-white">{d.oneThing}</div>
      </Item>
      <Item className="flex gap-2 text-[13px] leading-snug text-white/55 italic">
        <Check size={14} className="mt-0.5 shrink-0 opacity-0" />
        {d.question}
      </Item>
    </Stage>
  );
}
