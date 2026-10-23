"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addGoal, addStep, claimReward, deleteGoal, deleteStep, markGoal, setGoalsTheme } from "@/lib/actions/goals";
import type { Goal } from "@/lib/data/goals";
import { Btn, Field } from "@/components/m";
import { cn } from "@/lib/cn";
import { Seg } from "@/components/m/Seg";
import { GoalRocket, GoalSky, GoalTree } from "./GoalTree";

type Theme = "tree" | "stars" | "rocket";
const WORDS: Record<Theme, { leaf: string; bloom: string; idle: string; empty: string; fresh: string }> = {
  tree: { leaf: "+ Leaf", bloom: "✿", idle: "Every step is a leaf. Every goal reached, a blossom.", empty: "Plant the first goal and the tree begins.", fresh: "A new blossom." },
  stars: { leaf: "+ Star", bloom: "✦", idle: "Every step is a star. Every goal reached, a constellation.", empty: "Name the first goal and the sky begins.", fresh: "A new constellation, shining." },
  rocket: { leaf: "+ Thrust", bloom: "◉", idle: "Every step lifts the rocket. Every goal reached, a world behind you.", empty: "Set the first goal and the countdown begins.", fresh: "Another world behind you." },
};

const date = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const daysTo = (d: string, today: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

function GoalCard({ g, today, onReached, theme }: { g: Goal; today: string; onReached: (id: string) => void; theme: Theme }) {
  const router = useRouter();
  const [step, setStep] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();
  const done = !!g.completedAt;
  const left = g.targetDay ? daysTo(g.targetDay, today) : null;
  const steps = [...g.steps].reverse();
  const shown = showAll ? steps : steps.slice(0, 3);
  const run = (fn: () => Promise<unknown>) => start(async () => void (await fn(), router.refresh()));

  return (
    <article className={cn("border-b border-line py-6", done && "opacity-80")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 className={cn("font-serif text-[clamp(1.25rem,2.2vw,1.6rem)] leading-[1.3] font-light", done && "text-pos")}>
          {done && <span className="mr-2 text-[0.7em] text-gold">{WORDS[theme].bloom}</span>}
          {g.title}
        </h3>
        <span className="font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">
          {done ? (
            <span className="text-pos">Reached {date(g.completedAt!)}</span>
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
              <span aria-hidden className="text-[10px] text-pos">❦</span>
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
            placeholder="What did you do towards it today?"
            aria-label={`A step towards ${g.title}`}
            className="min-w-0 flex-1 border-0 border-b border-line-2 bg-transparent py-2 font-mono text-[12.5px] text-ink outline-none placeholder:text-ink-4 focus:border-gold"
          />
          <button type="submit" disabled={pending || !step.trim()} className="pb-2 font-mono text-[9.5px] tracking-[0.26em] text-pos uppercase disabled:opacity-30">
            {WORDS[theme].leaf}
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
            {WORDS[theme].bloom} Goal reached
          </button>
        )}
        <button
          type="button"
          onClick={() => confirm(`Delete "${g.title}" and its steps? Its branch comes off the tree.`) && run(() => deleteGoal(g.id))}
          className="text-ink-4 hover:text-ink"
        >
          Delete
        </button>
      </div>
    </article>
  );
}

/** Goals, the steps towards them, and the tree that grows with both. */
export function Goals({ goals, today, theme: initialTheme = "tree" }: { goals: Goal[]; today: string; theme?: Theme }) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [adding, setAdding] = useState(goals.length === 0);
  const [form, setForm] = useState({ title: "", why: "", targetDay: "", reward: "" });
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [showReached, setShowReached] = useState(false);
  const [pending, start] = useTransition();
  const open = goals.filter((g) => !g.completedAt);
  const reached = goals.filter((g) => g.completedAt);
  const steps = goals.reduce((n, g) => n + g.steps.length, 0);
  const tree = goals.map((g) => ({ id: g.id, done: !!g.completedAt, steps: g.steps.length }));
  const freshGoal = fresh ? goals.find((g) => g.id === fresh) : null;
  const toClaim = reached.filter((g) => g.reward && !g.rewardClaimedAt);
  const waiting = open.filter((g) => g.reward);
  const W = WORDS[theme];

  return (
    <div className="grid gap-x-[clamp(3rem,6vw,6rem)] gap-y-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="mb-4 flex justify-center">
          <Seg
            value={theme}
            onChange={(t) => {
              setTheme(t);
              start(() => void setGoalsTheme(t));
            }}
            options={[
              { value: "tree", label: "Tree" },
              { value: "stars", label: "Stars" },
              { value: "rocket", label: "Rocket" },
            ]}
          />
        </div>
        {theme === "stars" ? <GoalSky goals={tree} fresh={fresh} /> : theme === "rocket" ? <GoalRocket goals={tree} fresh={fresh} /> : <GoalTree goals={tree} fresh={fresh} />}
        <div className="mt-4 text-center font-mono text-[9.5px] tracking-[0.28em] text-ink-4 uppercase">
          <span className="text-gold">{W.bloom} {reached.length}</span> reached · <span className="text-pos">{steps}</span> {steps === 1 ? "step" : "steps"} · {open.length} in progress
        </div>
        {freshGoal?.reward ? (
          <div aria-live="polite" className="mx-auto mt-5 max-w-[26rem] border border-gold/60 px-6 py-5 text-center">
            <div className="font-mono text-[9.5px] tracking-[0.34em] text-gold uppercase">◆ You&apos;ve earned it</div>
            <p className="mt-3 font-serif text-[clamp(1.4rem,2.6vw,1.9rem)] leading-[1.25] font-light" data-private>
              {freshGoal.reward}
            </p>
            <p className="mt-2 font-mono text-[10.5px] text-ink-3">for “{freshGoal.title}”. You did what you said you would.</p>
          </div>
        ) : (
          <p aria-live="polite" className="mt-3 text-center font-serif text-[1.15rem] font-light italic text-ink-2">
            {fresh ? `${W.fresh} You did what you said you would.` : goals.length === 0 ? W.empty : W.idle}
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
                  <span className="truncate text-[9.5px] tracking-[0.18em] text-ink-4 uppercase">locked · {g.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <span className="eyebrow">Growing · {open.length}</span>
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
              start(async () => {
                const r = await addGoal({ title: form.title, why: form.why || null, targetDay: form.targetDay || null, reward: form.reward || null });
                if ("error" in r && r.error) return setError(r.error);
                setForm({ title: "", why: "", targetDay: "", reward: "" });
                setAdding(false);
                router.refresh();
              });
            }}
          >
            <Field label="The goal">
              <input className="field" value={form.title} maxLength={160} placeholder="Trade only 14:30–16:00 for two weeks" onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Why it matters · optional">
              <input className="field" value={form.why} maxLength={1000} placeholder="So the funded accounts pay the bills" onChange={(e) => setForm({ ...form, why: e.target.value })} />
            </Field>
            <Field label="Your reward when you reach it · optional" hint="Something you'll genuinely want, sized to what you can afford.">
              <input className="field" value={form.reward} maxLength={160} placeholder="5 Litecoin" onChange={(e) => setForm({ ...form, reward: e.target.value })} />
            </Field>
            <Field label="By when · optional">
              <input className="field w-44" type="date" value={form.targetDay} min={today} onChange={(e) => setForm({ ...form, targetDay: e.target.value })} />
            </Field>
            <div className="flex items-center gap-6">
              <Btn type="submit" variant="primary" disabled={pending || !form.title.trim()}>
                {pending ? "Planting…" : "Plant it"}
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
            <GoalCard key={g.id} g={g} today={today} onReached={setFresh} theme={theme} />
          ))}
          {open.length === 0 && !adding && <p className="py-6 font-mono text-[11.5px] text-ink-3">Nothing growing right now. Plant the next one.</p>}
        </div>

        {reached.length > 0 && (
          <div className="mt-8">
            <button type="button" onClick={() => setShowReached((s) => !s)} className="eyebrow hover:text-ink">
              {showReached ? "▾" : "▸"} Reached · {reached.length}
            </button>
            {showReached && (
              <div className="mt-2 border-t border-line">
                {[...reached].reverse().map((g) => (
                  <GoalCard key={g.id} g={g} today={today} onReached={setFresh} theme={theme} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
