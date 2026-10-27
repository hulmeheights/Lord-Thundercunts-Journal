"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addGoal, addStep, claimReward, deleteGoal, deleteStep, markGoal, restartGoal, setMission, setMissionCounts } from "@/lib/actions/goals";
import type { Goal } from "@/lib/data/goals";
import type { MissionDay } from "@/lib/analytics/mission";
import { describeMeasure, type GoalMeasure, type GoalProgress, type GoalRule, type GoalSpan, type RateMetric, type TotalMetric } from "@/lib/analytics/goalcheck";
import { Btn, Field } from "@/components/m";
import { Seg } from "@/components/m/Seg";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MissionScene } from "./GoalTree";

export type MissionView = { name: string; altitude: number; streak: number; burns: number; holds: number; leaks: number; days: MissionDay[] };

const date = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const daysTo = (d: string, today: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
const KIND_WORD = { burn: "Full burn", hold: "Held altitude", leak: "Fuel leak" } as const;

// ── How a trading goal measures itself ──────────────────────────────────────

type RuleKey = GoalRule["type"];
type MeasureForm = {
  type: "rules" | "total" | "rate" | "manual";
  on: Record<RuleKey, boolean>;
  v: { start: string; end: string; maxTrades: string; maxDayLoss: string; stopAfterLosses: string; maxLossPerTrade: string; maxContracts: string; cooldown: string };
  span: GoalSpan;
  spanN: string;
  until: string;
  total: TotalMetric;
  target: string;
  rate: RateMetric;
  rateTarget: string;
  over: string;
};

const RULE_KEYS: RuleKey[] = ["window", "maxTrades", "maxDayLoss", "stopAfterLosses", "maxLossPerTrade", "maxContracts", "cooldown", "noRevenge", "greenDay", "myRules"];

function emptyMeasure(d: { start: string | null; end: string | null }): MeasureForm {
  return {
    type: "rules",
    on: Object.fromEntries(RULE_KEYS.map((k) => [k, k === "window"])) as Record<RuleKey, boolean>,
    v: { start: d.start ?? "14:30", end: d.end ?? "16:00", maxTrades: "3", maxDayLoss: "500", stopAfterLosses: "2", maxLossPerTrade: "300", maxContracts: "5", cooldown: "15" },
    span: "weeks",
    spanN: "2",
    until: "",
    total: "net",
    target: "2000",
    rate: "winRate",
    rateTarget: "55",
    over: "30",
  };
}

const num = (s: string) => Number(s.replace(/[,$%\s]/g, ""));
const whole = (s: string) => Number.isInteger(num(s)) && num(s) >= 1;

function buildMeasure(m: MeasureForm): { measure: GoalMeasure | null } | { error: string } {
  if (m.type === "manual") return { measure: null };
  if (m.type === "total") return num(m.target) > 0 ? { measure: { kind: "total", metric: m.total, target: num(m.target) } } : { error: "Set the number to reach." };
  if (m.type === "rate") {
    if (!(num(m.rateTarget) > 0 && num(m.rateTarget) <= 100)) return { error: "The rate is a percentage, 1–100." };
    if (!whole(m.over)) return { error: "Over how many?" };
    return { measure: { kind: "rate", metric: m.rate, target: num(m.rateTarget), over: num(m.over) } };
  }
  const rules: GoalRule[] = [];
  const { v } = m;
  for (const k of RULE_KEYS) {
    if (!m.on[k]) continue;
    if (k === "window") {
      if (!/^\d{2}:\d{2}$/.test(v.start) || !/^\d{2}:\d{2}$/.test(v.end) || v.start === v.end) return { error: "Set the window's start and end." };
      rules.push({ type: "window", start: v.start, end: v.end });
    } else if (k === "maxTrades" || k === "stopAfterLosses" || k === "maxContracts") {
      if (!whole(v[k])) return { error: "Each rule needs a whole number." };
      rules.push({ type: k, n: num(v[k]) });
    } else if (k === "maxDayLoss" || k === "maxLossPerTrade") {
      if (!(num(v[k]) > 0)) return { error: "Each rule needs an amount." };
      rules.push({ type: k, amount: num(v[k]) });
    } else if (k === "cooldown") {
      if (!whole(v.cooldown)) return { error: "How many minutes after a loss?" };
      rules.push({ type: "cooldown", minutes: num(v.cooldown) });
    } else rules.push({ type: k });
  }
  if (!rules.length) return { error: "Tick at least one rule." };
  if (m.span === "until") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.until)) return { error: "Pick the end date." };
    return { measure: { kind: "days", rules, span: "until", n: 1, until: m.until } };
  }
  if (!whole(m.spanN)) return { error: "For how long?" };
  return { measure: { kind: "days", rules, span: m.span, n: num(m.spanN) } };
}

function preview(m: MeasureForm): string {
  const b = buildMeasure(m);
  return "measure" in b && b.measure ? describeMeasure(b.measure) : "…";
}

const small = "field num h-8 w-16 px-2 py-0 text-center";
const label = "mb-3 block font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase";

function MeasureEditor({ m, setM }: { m: MeasureForm; setM: (m: MeasureForm) => void }) {
  const v = (k: keyof MeasureForm["v"], w = small, mode: "numeric" | "decimal" = "numeric") => (
    <input className={w} inputMode={mode} value={m.v[k]} maxLength={7} aria-label={k} onChange={(e) => setM({ ...m, v: { ...m.v, [k]: e.target.value } })} />
  );
  const time = (k: "start" | "end") => <input className="field num h-8 w-[7.5rem] px-2 py-0" type="time" value={m.v[k]} aria-label={k === "start" ? "Window start" : "Window end"} onChange={(e) => setM({ ...m, v: { ...m.v, [k]: e.target.value } })} />;
  const rows: { k: RuleKey; body: React.ReactNode }[] = [
    { k: "window", body: <>Only enter between {time("start")} and {time("end")}</> },
    { k: "maxTrades", body: <>No more than {v("maxTrades")} trades a day</> },
    { k: "maxDayLoss", body: <>Never lose more than ${v("maxDayLoss", "field num h-8 w-20 px-2 py-0 text-center", "decimal")} in a day</> },
    { k: "stopAfterLosses", body: <>Stop after {v("stopAfterLosses")} losses in a row</> },
    { k: "maxLossPerTrade", body: <>No single loss bigger than ${v("maxLossPerTrade", "field num h-8 w-20 px-2 py-0 text-center", "decimal")}</> },
    { k: "maxContracts", body: <>No more than {v("maxContracts")} contracts</> },
    { k: "cooldown", body: <>Wait {v("cooldown")} minutes after a loss</> },
    { k: "noRevenge", body: <>No revenge trades</> },
    { k: "greenDay", body: <>Every trading day green</> },
    { k: "myRules", body: <>Keep all my rules from Settings</> },
  ];
  return (
    <div className="space-y-5">
      <div>
        <span className={label}>How it's measured</span>
        <Seg
          value={m.type}
          onChange={(t) => setM({ ...m, type: t })}
          options={[
            { value: "rules", label: "Rules kept" },
            { value: "total", label: "A number" },
            { value: "rate", label: "A rate" },
            { value: "manual", label: "I'll mark it" },
          ]}
        />
      </div>

      {m.type === "rules" && (
        <>
          <div>
            <span className={label}>Every trading day · tick the rules</span>
            <ul className="space-y-1">
              {rows.map((r) => (
                <li key={r.k}>
                  <label className={cn("flex min-h-9 cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px]", m.on[r.k] ? "text-ink" : "text-ink-4")}>
                    <input type="checkbox" className="accent-[var(--gold)]" checked={m.on[r.k]} onChange={(e) => setM({ ...m, on: { ...m.on, [r.k]: e.target.checked } })} />
                    {r.body}
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-2 font-mono text-[10.5px] leading-[1.8] text-ink-4">Days you don't trade don't count for or against it. Entry times use your timezone in Settings.</p>
          </div>
          <div>
            <span className={label}>For how long</span>
            <div className="flex flex-wrap items-center gap-3">
              {m.span === "until" ? (
                <input className="field num h-9 w-44" type="date" value={m.until} min={new Date().toISOString().slice(0, 10)} aria-label="Until" onChange={(e) => setM({ ...m, until: e.target.value })} />
              ) : (
                <input className={small} inputMode="numeric" value={m.spanN} maxLength={3} aria-label="How long" onChange={(e) => setM({ ...m, spanN: e.target.value.replace(/[^\d]/g, "") })} />
              )}
              <Seg
                value={m.span}
                onChange={(s) => setM({ ...m, span: s })}
                options={[
                  { value: "weeks", label: "Weeks, no breaks" },
                  { value: "until", label: "Until a date" },
                  { value: "inARow", label: "Trading days in a row" },
                  { value: "total", label: "Trading days in total" },
                ]}
              />
            </div>
            <p className="mt-2 font-mono text-[10.5px] leading-[1.8] text-ink-4">
              {m.span === "weeks" || m.span === "until"
                ? `Starts today${m.span === "until" ? " and runs to the end of that day" : ""}. One break and it's broken; you can start it again.`
                : m.span === "inARow"
                  ? "A break resets the count to zero."
                  : "Breaks don't reset it; every day kept counts."}
            </p>
          </div>
        </>
      )}

      {m.type === "total" && (
        <div className="flex flex-wrap items-center gap-3">
          <select className="field h-9 py-0 font-mono text-[11.5px]" value={m.total} aria-label="What to reach" onChange={(e) => setM({ ...m, total: e.target.value as TotalMetric })}>
            <option value="net">Net P&amp;L of at least $</option>
            <option value="paidOut">Paid out at least $</option>
            <option value="payouts">Payouts, at least</option>
            <option value="evalsPassed">Evals passed, at least</option>
          </select>
          <input className="field num h-9 w-28" inputMode="decimal" value={m.target} maxLength={10} aria-label="Target" onChange={(e) => setM({ ...m, target: e.target.value })} />
          <p className="w-full font-mono text-[10.5px] leading-[1.8] text-ink-4">Counted from today. Payouts and evals come from the ledger on Guardian.</p>
        </div>
      )}

      {m.type === "rate" && (
        <div className="flex flex-wrap items-center gap-3 font-mono text-[12px]">
          <select className="field h-9 py-0 font-mono text-[11.5px]" value={m.rate} aria-label="Which rate" onChange={(e) => setM({ ...m, rate: e.target.value as RateMetric })}>
            <option value="winRate">Win rate</option>
            <option value="greenDays">Green days</option>
          </select>
          of at least <input className={small} inputMode="decimal" value={m.rateTarget} maxLength={5} aria-label="Rate" onChange={(e) => setM({ ...m, rateTarget: e.target.value })} />% over my next
          <input className={small} inputMode="numeric" value={m.over} maxLength={3} aria-label="Over" onChange={(e) => setM({ ...m, over: e.target.value.replace(/[^\d]/g, "") })} />
          {m.rate === "winRate" ? "trades" : "trading days"}
        </div>
      )}
    </div>
  );
}

function GoalProgressBlock({ g, p, onRestart, busy, today }: { g: Goal; p: GoalProgress; onRestart: () => void; busy: boolean; today: string }) {
  const done = !!g.completedAt;
  const marks = p.marks.slice(-21);
  const tone = p.status === "broken" ? "text-neg" : p.status === "reached" || done ? "text-pos" : "text-gold";
  return (
    <div className="mt-3 max-w-[30rem]">
      <div className="flex flex-wrap justify-between gap-x-4 font-mono text-[10px] tracking-[0.14em] text-ink-3 uppercase">
        <span>{p.status === "broken" ? "Broken" : done ? "Checked from your trades" : "Checks itself from your trades"}</span>
        <span className={tone}>{p.headline}</span>
      </div>
      <div className="mt-1.5 h-px bg-line">
        <div className={cn("h-px", p.status === "broken" ? "bg-neg" : "bg-gold")} style={{ width: `${Math.round(Math.min(1, p.progress) * 100)}%` }} />
      </div>
      {marks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label="Trading days so far">
          {marks.map((d) => (
            <span key={d.day} title={`${short(d.day)}${d.ok ? " · kept" : ` · ${d.why.join(", ")}`}`} className={cn("font-mono text-[9px]", d.ok ? "text-gold" : "text-neg")}>
              {d.ok ? "▲" : "▽"}
            </span>
          ))}
        </div>
      )}
      {p.detail && <p className="mt-2 font-mono text-[10.5px] leading-[1.75] text-ink-3">{p.detail}</p>}
      {p.status === "broken" && !done && (
        <button type="button" disabled={busy} onClick={onRestart} className="mt-2 font-mono text-[9.5px] tracking-[0.26em] text-gold uppercase hover:text-ink disabled:opacity-40">
          ↻ Start again {marks.some((d) => d.day === today && !d.ok) ? "from tomorrow" : "from today"}
        </button>
      )}
    </div>
  );
}

function GoalCard({ g, today, onReached, progress }: { g: Goal; today: string; onReached: (id: string) => void; progress: GoalProgress | null }) {
  const router = useRouter();
  const [step, setStep] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();
  const done = !!g.completedAt;
  const auto = g.kind === "trading" && g.measure !== null;
  const rule = g.measure ? describeMeasure(g.measure) : null;
  const left = g.targetDay ? daysTo(g.targetDay, today) : null;
  const steps = [...g.steps].reverse();
  const shown = showAll ? steps : steps.slice(0, 3);
  const run = (fn: () => Promise<unknown>) => start(async () => void (await fn(), router.refresh()));

  return (
    <article className={cn("border-b border-line py-6", done && "opacity-85")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 className={cn("font-serif text-[clamp(1.25rem,2.2vw,1.6rem)] leading-[1.3] font-light", done && "text-pos")}>
          <span className={cn("mr-3 align-middle font-mono text-[8.5px] tracking-[0.26em] uppercase", g.kind === "trading" ? "text-gold" : "text-ink-3")}>{g.kind === "trading" ? "Trading" : "Life"}</span>
          {g.title}
        </h3>
        <span className="font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">
          {done ? (
            <span className="text-pos">◉ Reached {date(g.completedAt!)}</span>
          ) : left === null ? (
            `${g.steps.length} ${g.steps.length === 1 ? "step" : "steps"}`
          ) : left >= 0 ? (
            <>
              by {date(g.targetDay!)} · <span className="text-gold">{left} {left === 1 ? "day" : "days"} left</span>
            </>
          ) : (
            `target was ${date(g.targetDay!)}`
          )}
        </span>
      </div>
      {g.why && <p className="mt-2 max-w-[60ch] font-mono text-[11.5px] leading-[1.85] text-ink-3" data-private>Why: {g.why}</p>}
      {rule && rule !== g.title && <p className="mt-1.5 font-mono text-[11px] leading-[1.75] text-ink-2">◇ {rule}</p>}
      {progress && <GoalProgressBlock g={g} p={progress} today={today} busy={pending} onRestart={() => run(() => restartGoal(g.id))} />}
      {g.reward && (
        <p className={cn("mt-2 font-mono text-[11px] tracking-[0.06em]", done ? "text-pos" : "text-gold")} data-private>
          {done ? "◆ Earned: " : "◆ Earns: "}
          <span className="text-ink">{g.reward}</span>
          {done && (
            <button
              type="button"
              onClick={() => run(() => claimReward(g.id, !g.rewardClaimedAt))}
              className="ml-4 font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase underline decoration-line-2 underline-offset-4 hover:text-ink"
            >
              {g.rewardClaimedAt ? `claimed ${date(g.rewardClaimedAt)} · undo` : "I've claimed it"}
            </button>
          )}
        </p>
      )}

      {shown.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {shown.map((s) => (
            <li key={s.id} className="group grid grid-cols-[1rem_4.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3">
              <span aria-hidden className="text-[9px] text-gold">▲</span>
              <span className="font-mono text-[10px] tracking-[0.1em] text-ink-4">{new Date(`${s.day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })}</span>
              <span className="font-mono text-[12px] leading-[1.7] text-ink-2" data-private>{s.text}</span>
              <button type="button" onClick={() => run(() => deleteStep(s.id))} className="font-mono text-[9px] tracking-[0.2em] text-ink-4 uppercase opacity-0 group-hover:opacity-100 hover:text-ink focus:opacity-100" aria-label="Remove step">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {steps.length > 3 && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-2 font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase hover:text-ink">
          {showAll ? "Fewer" : `All ${steps.length} steps`}
        </button>
      )}

      {!done && (
        <form
          className="mt-4 flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!step.trim()) return;
            const text = step;
            setStep("");
            run(() => addStep(g.id, text));
          }}
        >
          <input
            value={step}
            onChange={(e) => setStep(e.target.value)}
            maxLength={500}
            placeholder={g.kind === "life" ? "What did you do towards it today? (a run, a session…)" : "What did you do towards it today?"}
            aria-label={`A step towards ${g.title}`}
            className="min-w-0 flex-1 border-0 border-b border-line-2 bg-transparent py-2 font-mono text-[12.5px] text-ink outline-none placeholder:text-ink-4 focus:border-gold"
          />
          <button type="submit" disabled={pending || !step.trim()} className="pb-2 font-mono text-[9.5px] tracking-[0.26em] text-gold uppercase disabled:opacity-30">
            + Thrust
          </button>
        </form>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-3 font-mono text-[9.5px] tracking-[0.26em] uppercase">
        {done ? (
          <button type="button" onClick={() => run(() => markGoal(g.id, false))} className="text-ink-4 hover:text-ink">
            Not reached after all
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onReached(g.id);
              run(() => markGoal(g.id, true));
            }}
            className="text-gold hover:text-ink"
          >
            ◉ {auto ? "Reached early" : "Goal reached"}
          </button>
        )}
        <button
          type="button"
          onClick={() => confirm(`Delete "${g.title}" and its steps?`) && run(() => deleteGoal(g.id))}
          className="text-ink-4 hover:text-ink"
        >
          Delete
        </button>
      </div>
    </article>
  );
}

/** The mission: your goals as worlds to pass, flown by the discipline your trades show. */
type CountRule = "session" | "maxTrades" | "maxDailyLoss" | "stopAfterLosses";
const COUNT_LABEL: Record<CountRule, string> = {
  session: "Inside my window",
  maxTrades: "Within my trade limit",
  maxDailyLoss: "Within my daily loss limit",
  stopAfterLosses: "Stopped after my losing streak",
};

/** Which of your trading rules decide a clean day (burn) versus a leak. */
function CleanDayRules({ initial }: { initial: CountRule[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState<CountRule[]>(initial);
  const [pending, start] = useTransition();
  const toggle = (k: CountRule, v: boolean) => {
    const next = v ? [...on, k] : on.filter((x) => x !== k);
    if (!next.length) return;
    setOn(next);
    start(async () => void (await setMissionCounts(next), router.refresh()));
  };
  return (
    <div className="mt-5 text-center">
      <button type="button" onClick={() => setOpen((o) => !o)} className="font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase hover:text-ink">
        {open ? "▾" : "▸"} A clean day means: {on.length === 4 ? "all my rules" : on.map((k) => COUNT_LABEL[k].toLowerCase()).join(", ")}
      </button>
      {open && (
        <div className="mx-auto mt-3 flex max-w-[26rem] flex-col items-start gap-2 border-t border-line pt-3 text-left">
          {(Object.keys(COUNT_LABEL) as CountRule[]).map((k) => (
            <label key={k} className={cn("flex cursor-pointer items-center gap-2 font-mono text-[11.5px]", on.includes(k) ? "text-ink" : "text-ink-4")}>
              <input type="checkbox" className="accent-[var(--gold)]" disabled={pending || (on.length === 1 && on.includes(k))} checked={on.includes(k)} onChange={(e) => toggle(k, e.target.checked)} />
              {COUNT_LABEL[k]}
            </label>
          ))}
          <p className="font-mono text-[10px] leading-[1.7] text-ink-4">A day that breaks a ticked rule leaks fuel. The limits themselves are in Settings → Trading rules.</p>
        </div>
      )}
    </div>
  );
}

export function Goals({
  goals,
  today,
  mission,
  progress,
  autoReached = [],
  defaults,
  counts = ["session", "maxTrades", "maxDailyLoss", "stopAfterLosses"],
}: {
  counts?: CountRule[];
  goals: Goal[];
  today: string;
  mission: MissionView;
  progress: Record<string, GoalProgress>;
  autoReached?: string[];
  defaults: { start: string | null; end: string | null };
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(goals.length === 0);
  const [form, setForm] = useState({ title: "", why: "", targetDay: "", reward: "", kind: "trading" as "trading" | "life" });
  const [m, setM] = useState<MeasureForm>(() => emptyMeasure(defaults));
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(autoReached[0] ?? null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(mission.name);
  const [showReached, setShowReached] = useState(false);
  const [pending, start] = useTransition();
  const open = goals.filter((g) => !g.completedAt);
  const reached = goals.filter((g) => g.completedAt);
  const freshGoal = fresh ? goals.find((g) => g.id === fresh) : null;
  const toClaim = reached.filter((g) => g.reward && !g.rewardClaimedAt);
  const waiting = open.filter((g) => g.reward);
  const recent = [...mission.days].reverse().slice(0, 14);
  const leaking = mission.days.length > 0 && mission.days[mission.days.length - 1]!.kind === "leak";

  return (
    <div className="grid gap-x-[clamp(3rem,6vw,6rem)] gap-y-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="mb-3 text-center">
          <div className="font-mono text-[9px] tracking-[0.34em] text-ink-4 uppercase">Mission</div>
          {naming ? (
            <form
              className="mt-2 flex justify-center gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                setNaming(false);
                start(async () => void (await setMission(name), router.refresh()));
              }}
            >
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus aria-label="Mission name" className="field max-w-[18rem] text-center" />
              <button type="submit" className="font-mono text-[9.5px] tracking-[0.26em] text-gold uppercase">
                Save
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setNaming(true)} className="mt-1 font-serif text-[clamp(1.3rem,2.4vw,1.75rem)] font-light italic hover:text-gold" title="Rename the mission">
              {mission.name}
            </button>
          )}
        </div>

        <MissionScene stages={goals.map((g) => ({ id: g.id, done: !!g.completedAt }))} altitude={mission.altitude} streak={mission.streak} leaking={leaking} fresh={fresh} />

        <div className="mt-4 grid grid-cols-3 text-center">
          {[
            { v: mission.altitude.toLocaleString("en-US"), l: "Altitude" },
            { v: mission.streak, l: mission.streak === 1 ? "Clean day in a row" : "Clean days in a row" },
            { v: `${reached.length} / ${goals.length}`, l: "Worlds passed" },
          ].map((s) => (
            <div key={s.l}>
              <div className="num font-mono text-[clamp(1.3rem,2.2vw,1.7rem)] font-light">{s.v}</div>
              <div className="mt-1 font-mono text-[8.5px] tracking-[0.24em] text-ink-4 uppercase">{s.l}</div>
            </div>
          ))}
        </div>
        <CleanDayRules initial={counts} />

        {freshGoal?.reward ? (
          <div aria-live="polite" className="mx-auto mt-6 max-w-[26rem] border border-gold/60 px-6 py-5 text-center">
            <div className="font-mono text-[9.5px] tracking-[0.34em] text-gold uppercase">◆ You&apos;ve earned it</div>
            <p className="mt-3 font-serif text-[clamp(1.4rem,2.6vw,1.9rem)] leading-[1.25] font-light" data-private>
              {freshGoal.reward}
            </p>
            <p className="mt-2 font-mono text-[10.5px] text-ink-3">for “{freshGoal.title}”. You did what you said you would.</p>
          </div>
        ) : (
          <p aria-live="polite" className="mt-5 text-center font-serif text-[1.1rem] font-light italic text-ink-2">
            {fresh
              ? "Another world behind you. You did what you said you would."
              : leaking
                ? "Fuel leak on the last day. One clean session and the engine is back."
                : mission.streak >= 5
                  ? "The engine is running white-hot. Keep the window."
                  : "Clean sessions lift it. Steps lift it. Goals reached leave worlds behind you."}
          </p>
        )}

        {(toClaim.length > 0 || waiting.length > 0) && (
          <div className="mt-8 border-t border-line pt-5">
            <div className="mb-3 eyebrow">Rewards</div>
            <ul className="space-y-2 font-mono text-[11px]" data-private>
              {toClaim.map((g) => (
                <li key={g.id} className="flex items-baseline justify-between gap-4">
                  <span className="text-pos">◆ {g.reward}</span>
                  <span className="text-[9.5px] tracking-[0.22em] text-gold uppercase">earned · take it</span>
                </li>
              ))}
              {waiting.map((g) => (
                <li key={g.id} className="flex items-baseline justify-between gap-4">
                  <span className="text-ink-3">◇ {g.reward}</span>
                  <span className="truncate text-[9.5px] tracking-[0.18em] text-ink-4 uppercase">
                    locked · {progress[g.id] ? progress[g.id]!.headline : g.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {recent.length > 0 && (
          <div className="mt-8 border-t border-line pt-5">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <span className="eyebrow">Flight log</span>
              <span className="font-mono text-[9px] tracking-[0.2em] text-ink-4 uppercase">
                {mission.burns} burns · {mission.holds} held · {mission.leaks} leaks
              </span>
            </div>
            <ul className="space-y-1.5 font-mono text-[10.5px]">
              {recent.map((d) => (
                <li key={d.day} className="grid grid-cols-[6.5rem_6.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3">
                  <span className="text-ink-4">{short(d.day)}</span>
                  <span className={d.kind === "burn" ? "text-gold" : d.kind === "leak" ? "text-neg" : "text-ink-3"}>
                    {d.kind === "burn" ? "▲" : d.kind === "leak" ? "▽" : "—"} {KIND_WORD[d.kind]}
                  </span>
                  <span className="truncate text-ink-3">{d.kind === "leak" ? d.reasons.join(", ") : d.trades ? `${d.trades} ${d.trades === 1 ? "trade" : "trades"}` : "sat out"}</span>
                  <span className={cn("num text-right", d.net > 0 ? "text-pos" : d.net < 0 ? "text-neg" : "text-ink-4")} data-private>
                    {d.trades ? fmtMoney(d.net, { sign: true }) : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <span className="eyebrow">Worlds ahead · {open.length}</span>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className="font-mono text-[9.5px] tracking-[0.26em] text-ink-2 uppercase hover:text-ink">
              + New goal
            </button>
          )}
        </div>

        {adding && (
          <form
            className="mb-6 space-y-5 border-t border-line pt-6"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              const built = form.kind === "trading" ? buildMeasure(m) : { measure: null };
              if ("error" in built) return setError(built.error);
              start(async () => {
                const r = await addGoal({
                  title: form.title,
                  why: form.why || null,
                  targetDay: form.targetDay || null,
                  reward: form.reward || null,
                  kind: form.kind,
                  measure: built.measure,
                });
                if ("error" in r && r.error) return setError(r.error);
                setForm({ title: "", why: "", targetDay: "", reward: "", kind: form.kind });
                setM(emptyMeasure(defaults));
                setAdding(false);
                router.refresh();
              });
            }}
          >
            <div>
              <span className="mb-3 block font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">What kind of goal</span>
              <Seg
                value={form.kind}
                onChange={(k) => setForm({ ...form, kind: k })}
                options={[
                  { value: "trading", label: "Trading" },
                  { value: "life", label: "Life" },
                ]}
              />
              <p className="mt-2 font-mono text-[10.5px] leading-[1.8] text-ink-4">
                {form.kind === "trading" ? "Trading goals check themselves against your trades and the Guardian ledger." : "Life goals (a marathon, a debt paid off) are yours to mark reached."}
              </p>
            </div>
            {form.kind === "trading" && <MeasureEditor m={m} setM={setM} />}
            <Field label={form.kind === "trading" && m.type !== "manual" ? "Name it · optional" : "The goal"} hint={form.kind === "trading" && m.type !== "manual" ? `Leave blank to call it: ${preview(m)}` : undefined}>
              <input
                className="field"
                value={form.title}
                maxLength={160}
                placeholder={form.kind === "trading" ? "Two weeks of 14:30–16:00 only" : "Run a marathon"}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            <Field label="Your reward when you reach it · optional" hint="Something you'll genuinely want, sized to what you can afford.">
              <input className="field" value={form.reward} maxLength={160} placeholder="5 Litecoin" onChange={(e) => setForm({ ...form, reward: e.target.value })} />
            </Field>
            <Field label="Why it matters · optional">
              <input className="field" value={form.why} maxLength={1000} placeholder="So the funded accounts pay the bills" onChange={(e) => setForm({ ...form, why: e.target.value })} />
            </Field>
            <Field label="By when · optional">
              <input className="field w-44" type="date" value={form.targetDay} min={today} onChange={(e) => setForm({ ...form, targetDay: e.target.value })} />
            </Field>
            <div className="flex items-center gap-6">
              <Btn type="submit" variant="primary" disabled={pending || (!form.title.trim() && (form.kind === "life" || m.type === "manual"))}>
                {pending ? "Plotting…" : "Add to the mission"}
              </Btn>
              {goals.length > 0 && (
                <button type="button" onClick={() => setAdding(false)} className="font-mono text-[9.5px] tracking-[0.26em] text-ink-4 uppercase hover:text-ink">
                  Cancel
                </button>
              )}
              {error && <span className="font-mono text-[11px] text-neg">{error}</span>}
            </div>
          </form>
        )}

        <div className="border-t border-line">
          {open.map((g) => (
            <GoalCard key={g.id} g={g} today={today} onReached={setFresh} progress={progress[g.id] ?? null} />
          ))}
          {open.length === 0 && !adding && <p className="py-6 font-mono text-[11.5px] text-ink-3">No worlds ahead. Plot the next one.</p>}
        </div>

        {reached.length > 0 && (
          <div className="mt-8">
            <button type="button" onClick={() => setShowReached((s) => !s)} className="eyebrow hover:text-ink">
              {showReached ? "▾" : "▸"} Worlds passed · {reached.length}
            </button>
            {showReached && (
              <div className="mt-2 border-t border-line">
                {[...reached].reverse().map((g) => (
                  <GoalCard key={g.id} g={g} today={today} onReached={setFresh} progress={progress[g.id] ?? null} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
