"use client";

import { motion } from "motion/react";
import { ArrowRight, Check, Compass, Eye, FlaskConical, Footprints, LoaderCircle, Target, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import type { Instruction, ObserverDossier, Obstacle } from "@/lib/analytics/observer";
import type { ObserverSession, ObserverWindow } from "@/lib/data/observer";
import type { Settings } from "@/lib/types";
import { adoptInstruction } from "@/lib/actions/observer";
import { fmtMoney } from "@/lib/format";
import { shortDate } from "@/lib/analytics/time";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Ritual } from "./Ritual";
import { SessionHistory } from "./SessionHistory";

const toneDot = { pos: "bg-pos", neg: "bg-neg", flat: "bg-ink-4" } as const;

function Panel({
  icon: Icon,
  color,
  eyebrow,
  title,
  children,
  delay = 0,
}: {
  icon: typeof Eye;
  color: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 30, delay }}
      className="glass relative overflow-hidden rounded-[3px] p-5 sm:p-6"
    >
      <div className="pointer-events-none absolute -top-24 -right-20 h-48 w-48 rounded-full opacity-25 blur-3xl" style={{ background: color }} />
      <div className="relative mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[3px]" style={{ background: `${color}22`, color }}>
          <Icon size={19} />
        </span>
        <div>
          <div className="eyebrow" style={{ color }}>{eyebrow}</div>
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
        </div>
      </div>
      <div className="relative">{children}</div>
    </motion.section>
  );
}

function ObstacleRow({ o, max, rank }: { o: Obstacle; max: number; rank: number }) {
  const [open, setOpen] = useState(rank === 1);
  return (
    <div className="rounded-[3px] border border-line bg-fill/60 p-3.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 text-left">
        <span className="num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange/15 text-[12px] font-bold text-orange">{rank}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] leading-snug font-semibold">{o.title}</span>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-fill-3">
            <motion.span
              className="block h-full rounded-full bg-gradient-to-r from-orange to-neg"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(6, (o.cost / max) * 100)}%` }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 + rank * 0.06 }}
            />
          </span>
        </span>
        <span className="num shrink-0 text-[14px] font-bold text-neg">−{fmtMoney(o.cost)}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2.5 pl-9">
          <p className="text-[13.5px] leading-relaxed text-ink-3">{o.detail}</p>
          <div className="flex flex-wrap gap-1.5">
            {o.evidence.map((e) => (
              <span key={e.label} className="inline-flex items-center gap-1.5 rounded-full bg-fill-2 px-2.5 py-1 text-[12px] text-ink-3">
                {e.label}
                <b className={cn("num font-semibold", e.tone === "pos" ? "text-pos" : e.tone === "neg" ? "text-neg" : "text-ink")}>{e.value}</b>
              </span>
            ))}
            <span className="rounded-full bg-fill-2 px-2.5 py-1 text-[12px] text-ink-4">{o.confidence} confidence · {o.sample} trades</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TellCard({ ins, name, window, index, sessionId }: { ins: Instruction; name: string; window: ObserverWindow; index: number; sessionId: string | null }) {
  const [pending, start] = useTransition();
  const [applied, setApplied] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAdopt = Boolean(ins.rulesPatch || ins.checklist);
  return (
    <div className="rounded-[3px] border border-purple/20 bg-purple/[0.06] p-4">
      <div className="eyebrow mb-1.5 text-purple">Instruction {index + 1}</div>
      <p className="text-[15px] leading-snug">
        <span className="text-ink-3">When </span>
        <span className="font-semibold">{ins.when}</span>
        <span className="text-ink-3">, </span>
        <span className="font-semibold">{ins.then}</span>
      </p>
      {ins.backtest && (
        <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-pos/12 px-2.5 py-1 text-[12px] text-pos">
          <FlaskConical size={13} /> Rule Lab: “{ins.backtest.label}” would have added <b className="num">{fmtMoney(ins.backtest.delta, { sign: true })}</b>
        </div>
      )}
      {canAdopt && (
        <div className="mt-3">
          {applied ? (
            <div className="space-y-1 text-[12.5px] text-pos">
              {applied.map((a) => (
                <div key={a} className="flex items-center gap-1.5"><Check size={14} /> {a}</div>
              ))}
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await adoptInstruction({ sessionId, obstacle: ins.obstacle, window });
                  if ("error" in r && r.error) setError(r.error);
                  else if ("applied" in r && r.applied) setApplied(r.applied);
                })
              }
            >
              {pending ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Hold {name} to it
            </Button>
          )}
          {error && <div className="mt-1.5 text-[12.5px] text-neg">{error}</div>}
        </div>
      )}
    </div>
  );
}

export function ObserverView({
  dossier,
  sessions,
  window,
  aiReady,
  prefs,
  nowCost,
}: {
  dossier: ObserverDossier;
  sessions: ObserverSession[];
  window: ObserverWindow;
  aiReady: boolean;
  prefs: Settings["observer"];
  nowCost: Record<string, number>;
}) {
  const [ritualOpen, setRitualOpen] = useState(false);
  const n = dossier.name;
  const max = Math.max(1, ...dossier.stopping.map((o) => o.cost));
  // Instructions adopted today count towards today's session, if there is one.
  const todaySession = sessions[0]?.day === dossier.to ? sessions[0].id : null;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="glass relative overflow-hidden rounded-[3px] p-6 sm:p-9"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,rgba(94,92,230,0.28),transparent_55%),radial-gradient(90%_70%_at_100%_100%,rgba(191,90,242,0.18),transparent_60%)]" />
        <div className="relative">
          <div className="mb-5 flex items-center gap-2.5 text-[12.5px] font-semibold tracking-wide text-ink-3 uppercase">
            <Eye size={15} className="text-cyan" /> Case file · {shortDate(dossier.from)} – {shortDate(dossier.to)} · {dossier.sample.trades} trades
          </div>
          <p className="max-w-3xl font-[family-name:var(--font-display)] text-[26px] leading-[1.18] font-bold tracking-[-0.025em] sm:text-[34px]">
            {dossier.headline}
          </p>
          <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-ink-3">
            People reason far more wisely about someone else&apos;s problems than their own. For the next three minutes, {n} isn&apos;t you —
            you&apos;re the coach watching every trade.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="brand" size="lg" onClick={() => setRitualOpen(true)}>
              Step outside <ArrowRight size={17} />
            </Button>
            {dossier.sample.low && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-orange">
                <TriangleAlert size={14} /> Small sample — treat these as hunches, not verdicts.
              </span>
            )}
          </div>
        </div>
      </motion.section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel icon={Target} color="#64d2ff" eyebrow="What they want" title={`What ${n} wants`} delay={0.05}>
          {dossier.wants.length ? (
            <ul className="space-y-2.5">
              {dossier.wants.map((w) => (
                <li key={w.text} className="text-[14.5px] leading-relaxed text-ink-2">{w.text}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-3">Nothing written yet. Step outside and put it into words — the observer uses it from then on.</p>
          )}
        </Panel>

        <Panel icon={Footprints} color="#0a84ff" eyebrow="What they're doing" title={`What ${n} is actually doing`} delay={0.1}>
          <ul className="space-y-2.5">
            {dossier.doing.map((f) => (
              <li key={f.text} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-2">
                <span className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", toneDot[f.tone])} />
                {f.text}
              </li>
            ))}
            {!dossier.doing.length && <li className="text-[14px] text-ink-3">No trades in this window yet.</li>}
          </ul>
          {dossier.strengths.length > 0 && (
            <div className="mt-4 rounded-[3px] bg-pos/[0.07] p-3.5">
              <div className="eyebrow mb-2 text-pos">Working</div>
              <ul className="space-y-1.5">
                {dossier.strengths.map((f) => (
                  <li key={f.text} className="text-[13.5px] leading-relaxed text-ink-2">{f.text}</li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel icon={TriangleAlert} color="#ff9f0a" eyebrow="What's stopping them" title={`What's stopping ${n}`} delay={0.15}>
          {dossier.stopping.length ? (
            <>
              <div className="space-y-2.5">
                {dossier.stopping.slice(0, 5).map((o, i) => (
                  <ObstacleRow key={o.key} o={o} max={max} rank={i + 1} />
                ))}
              </div>
              <p className="mt-3 text-[12px] text-ink-4">Ranked by what each pattern cost. They overlap, so don&apos;t add them up.</p>
            </>
          ) : (
            <p className="text-[14px] leading-relaxed text-ink-3">
              {dossier.sample.trades ? `No costly pattern stands out over these ${dossier.sample.trades} trades. That's what discipline looks like.` : "Waiting for trades."}
            </p>
          )}
        </Panel>

        <Panel icon={Compass} color="#bf5af2" eyebrow="What you'd tell them" title={`What to tell ${n}`} delay={0.2}>
          {dossier.tell.length ? (
            <div className="space-y-3">
              {dossier.tell.map((ins, i) => (
                <TellCard key={ins.obstacle} ins={ins} name={n} window={window} index={i} sessionId={todaySession} />
              ))}
            </div>
          ) : (
            <p className="text-[14px] leading-relaxed text-ink-3">Keep doing exactly what you&apos;re doing — and keep logging, so the observer can spot the next edge.</p>
          )}
        </Panel>
      </div>

      <SessionHistory sessions={sessions} name={n} nowCost={nowCost} aiReady={aiReady} onNew={() => setRitualOpen(true)} />

      <Ritual open={ritualOpen} onClose={() => setRitualOpen(false)} dossier={dossier} window={window} aiReady={aiReady} prefs={prefs} />
    </div>
  );
}
