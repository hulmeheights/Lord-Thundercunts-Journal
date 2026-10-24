"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addGoal, addStep, claimReward, deleteGoal, deleteStep, markGoal, setMission } from "@/lib/actions/goals";
import type { Goal } from "@/lib/data/goals";
import type { MissionDay } from "@/lib/analytics/mission";
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

function GoalCard({ g, today, onReached, clean }: { g: Goal; today: string; onReached: (id: string) => void; clean: number | null }) {
  const router = useRouter();
  const [step, setStep] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();
  const done = !!g.completedAt;
  const auto = g.kind === "trading" && g.autoCleanDays !== null;
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
      {auto && !done && clean !== null && (
        <div className="mt-3 max-w-[22rem]">
          <div className="flex justify-between font-mono text-[10px] tracking-[0.14em] text-ink-3 uppercase">
            <span>Counts itself from your trades</span>
            <span className="text-gold">
              {clean} / {g.autoCleanDays} clean days
            </span>
          </div>
          <div className="mt-1.5 h-px bg-line">
            <div className="h-px bg-gold" style={{ width: `${Math.min(100, (clean / g.autoCleanDays!) * 100)}%` }} />
          </div>
        </div>
      )}
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
export function Goals({ goals, today, mission, clean, autoReached = [] }: { goals: Goal[]; today: string; mission: MissionView; clean: Record<string, number>; autoReached?: string[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(goals.length === 0);
  const [form, setForm] = useState({ title: "", why: "", targetDay: "", reward: "", kind: "trading" as "trading" | "life", autoCleanDays: "" });
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
                    locked · {g.kind === "trading" && g.autoCleanDays ? `${Math.max(0, g.autoCleanDays - (clean[g.id] ?? 0))} clean days to go` : g.title}
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
              const n = Number(form.autoCleanDays);
              start(async () => {
                const r = await addGoal({
                  title: form.title,
                  why: form.why || null,
                  targetDay: form.targetDay || null,
                  reward: form.reward || null,
                  kind: form.kind,
                  autoCleanDays: form.kind === "trading" && Number.isInteger(n) && n >= 1 ? n : null,
                });
                if ("error" in r && r.error) return setError(r.error);
                setForm({ title: "", why: "", targetDay: "", reward: "", kind: form.kind, autoCleanDays: "" });
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
                {form.kind === "trading" ? "Trading goals can count themselves from your trades." : "Life goals (a marathon, a debt paid off) are yours to mark reached."}
              </p>
            </div>
            <Field label="The goal">
              <input
                className="field"
                value={form.title}
                maxLength={160}
                placeholder={form.kind === "trading" ? "Ten clean sessions, 14:30–16:00 only" : "Run a marathon"}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            {form.kind === "trading" && (
              <Field label="Reach it automatically after · optional" hint="Clean trading days: only inside your window, within your stops. Leave blank to mark it yourself.">
                <span className="flex items-baseline gap-3">
                  <input
                    className="field num w-24"
                    inputMode="numeric"
                    value={form.autoCleanDays}
                    maxLength={3}
                    placeholder="10"
                    onChange={(e) => setForm({ ...form, autoCleanDays: e.target.value.replace(/[^\d]/g, "") })}
                  />
                  <span className="font-mono text-[11px] text-ink-3">clean days</span>
                </span>
              </Field>
            )}
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
              <Btn type="submit" variant="primary" disabled={pending || !form.title.trim()}>
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
            <GoalCard key={g.id} g={g} today={today} onReached={setFresh} clean={clean[g.id] ?? null} />
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
                  <GoalCard key={g.id} g={g} today={today} onReached={setFresh} clean={clean[g.id] ?? null} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
