"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { OBSTACLE_KEYS, OBSTACLE_LABELS, type Instruction, type ObstacleKey, type PerceptionGap } from "@/lib/analytics/observer";
import type { ObserverWindow } from "@/lib/data/observer";
import type { Settings } from "@/lib/types";
import { saveObserverPrefs, saveObserverSession } from "@/lib/actions/observer";
import { Btn, Dot } from "@/components/m";
import { Seg } from "@/components/m/Seg";
import { cn } from "@/lib/cn";
import { CaseFileLoader } from "./CaseFile";
import { GAP_COPY, IfThen, monoBody, textBtn } from "./ui";

type Field = "wants" | "doing" | "stopping" | "advice";
type Draft = Record<Field, string> & { believed: ObstacleKey[] };
type Saved = { id: string; gap: Pick<PerceptionGap, "verdict" | "message"> };

const OBJ = { they: "them", he: "him", she: "her" } as const;
const EASE = [0.16, 1, 0.3, 1] as const;
const noop = () => () => {};

/** Writing about yourself in the first person defeats the point — catch it gently. */
const FIRST_PERSON = /(^|[^\p{L}'’])(I|I'm|I’m|I've|I’ve|I'd|I’d|I'll|I’ll)(?=$|[^\p{L}'’])|\b(me|my|mine|myself)\b/iu;
const firstPerson = (text: string) => {
  const m = text.match(FIRST_PERSON);
  if (!m) return false;
  // "I" must be a capital I; me/my can be any case.
  return m[2] ? /^I/.test(m[2]) : true;
};

const starters = (who: string): Record<Field, string> => ({ wants: `${who} wants `, doing: `${who} `, stopping: "", advice: `${who}, ` });

const STEPS: { key: Field; label: string; q: (who: string, obj: string) => React.ReactNode; hint: string }[] = [
  {
    key: "wants",
    label: "Wants",
    q: (who) => (
      <>
        What does <em>{who}</em> want?
      </>
    ),
    hint: "Not just the money. What would this month look like if it went exactly right?",
  },
  {
    key: "doing",
    label: "Doing",
    q: (who) => (
      <>
        What is <em>{who}</em> actually doing?
      </>
    ),
    hint: "Describe it the way a camera would — no excuses, no judgement. What happens after a loss? After a big win?",
  },
  {
    key: "stopping",
    label: "Stopping",
    q: (who) => (
      <>
        What&apos;s stopping <em>{who}</em>?
      </>
    ),
    hint: "Mark everything you think is in the way. The Observer will check each one against the evidence.",
  },
  {
    key: "advice",
    label: "Advice",
    q: (who, obj) => (
      <>
        If <em>{who}</em> were your best mate, what would you tell {obj}?
      </>
    ),
    hint: "As direct, and as kind, as you'd be with a friend. One or two things that would change tomorrow.",
  },
];

/** A borderless serif textarea on a hairline, growing with what's written. */
function Writing({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <textarea
      ref={ref}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      maxLength={2000}
      placeholder={placeholder}
      spellCheck
      className="block w-full resize-none overflow-hidden border-0 border-b border-line-2 bg-transparent pb-5 font-serif text-[clamp(1.3rem,2.7vw,1.9rem)] leading-[1.5] font-light tracking-[-0.005em] text-ink caret-gold transition-colors duration-500 outline-none placeholder:text-ink-4 focus:border-ink-3 focus-visible:outline-none"
    />
  );
}

export function Ritual({
  open,
  onClose,
  name: dossierName,
  tell,
  window,
  aiReady,
  prefs,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  tell: Instruction[];
  window: ObserverWindow;
  aiReady: boolean;
  prefs: Settings["observer"];
}) {
  const router = useRouter();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [name, setName] = useState(prefs.name ?? "");
  const [pronoun, setPronoun] = useState(prefs.pronoun);
  const who = name.trim() || dossierName;
  const obj = OBJ[pronoun];
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({ ...starters(dossierName), believed: [] });
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [prefsPending, startPrefs] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);

  const close = () => {
    onClose();
    if (saved) {
      router.refresh();
      // A saved session starts the next one fresh; an unsaved draft is kept.
      setTimeout(() => {
        setStep(0);
        setSaved(null);
        setError(null);
        setDraft({ ...starters(who), believed: [] });
      }, 500);
    }
  };

  // Lock the page behind the stage; Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window_.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window_.__lenis?.stop();
    return () => {
      window_.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      window_.__lenis?.start();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saved]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [step]);

  const clean = (k: Field) => {
    const v = draft[k].trim();
    return v === starters(who)[k].trim() ? null : v || null;
  };

  const begin = () =>
    startPrefs(async () => {
      const nextName = name.trim() || null;
      const nameChanged = nextName !== prefs.name;
      if (nameChanged || pronoun !== prefs.pronoun) {
        await saveObserverPrefs({ name: nextName, pronoun });
        router.refresh();
        // Re-seed untouched answers with the new name.
        const was = starters(dossierName);
        const now = starters(who);
        setDraft((d) => ({
          ...d,
          wants: d.wants === was.wants ? now.wants : d.wants,
          doing: d.doing === was.doing ? now.doing : d.doing,
          advice: d.advice === was.advice ? now.advice : d.advice,
        }));
      }
      setStep(1);
    });

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await saveObserverSession({
        window,
        wants: clean("wants"),
        doing: clean("doing"),
        stopping: clean("stopping"),
        advice: clean("advice"),
        believed: draft.believed,
      });
      if ("error" in r && r.error) setError(r.error);
      else if ("id" in r && r.id && r.gap) {
        setSaved({ id: r.id, gap: r.gap });
        setStep(5);
      }
    });

  const next = () => (step === 0 ? begin() : step < 4 ? setStep(step + 1) : submit());
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && step <= 4) {
      e.preventDefault();
      next();
    }
  };

  const toggle = (k: ObstacleKey) =>
    setDraft((d) => ({ ...d, believed: d.believed.includes(k) ? d.believed.filter((x) => x !== k) : [...d.believed, k] }));

  const q = step >= 1 && step <= 4 ? STEPS[step - 1]! : null;
  const slipped = q && q.key !== "advice" && firstPerson(draft[q.key]);

  const screen = (() => {
    if (step === 0) {
      return (
        <div>
          <div className="label">00 — Step outside</div>
          <h2 className="mt-[clamp(1.6rem,4vh,2.6rem)] max-w-[13ch] font-serif text-[clamp(2.5rem,7.4vw,5.6rem)] leading-[1.02] font-light tracking-[-0.01em] [&_em]:italic">
            For three minutes, you&apos;re <em>not you</em>.
          </h2>
          <p className={cn(monoBody, "mt-[clamp(1.6rem,4vh,2.4rem)] max-w-[46ch]")}>
            Picture {who} at the desk this morning — the screens, the first trade, what happened after it. You&apos;re across the room: a
            calm coach who has watched every trade. Write about {who} the way you&apos;d write about someone else.
          </p>
          <div className="mt-[clamp(2.8rem,7vh,4.5rem)] grid gap-10 border-t border-line pt-[clamp(1.8rem,4vh,2.4rem)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-16">
            <label className="block">
              <span className="eyebrow mb-3 block">The Observer calls you</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={dossierName}
                maxLength={40}
                className="block w-full max-w-[22rem] border-0 border-b border-line-2 bg-transparent pb-3 font-serif text-[1.6rem] leading-[1.2] font-light text-ink caret-gold transition-colors duration-500 outline-none placeholder:text-ink-4 focus:border-ink-3"
              />
            </label>
            <div>
              <span className="eyebrow mb-4 block">Pronouns</span>
              <Seg
                options={[
                  { value: "they", label: "They" },
                  { value: "he", label: "He" },
                  { value: "she", label: "She" },
                ]}
                value={pronoun}
                onChange={(v) => setPronoun(v)}
              />
            </div>
          </div>
        </div>
      );
    }
    if (q) {
      return (
        <div>
          <div className="label">
            {String(step).padStart(2, "0")} — {q.label}
          </div>
          <h2 className="mt-[clamp(1.4rem,4vh,2.4rem)] max-w-[17ch] font-serif text-[clamp(2.1rem,6vw,4.4rem)] leading-[1.06] font-light tracking-[-0.01em] [&_em]:italic">
            {q.q(who, obj)}
          </h2>
          <p className={cn(monoBody, "mt-[clamp(1.2rem,3vh,1.8rem)] max-w-[46ch] text-ink-3")}>{q.hint}</p>
          {q.key === "stopping" && (
            <div className="mt-[clamp(2rem,5vh,3rem)] flex flex-wrap gap-2.5" role="group" aria-label="What you think is in the way">
              {OBSTACLE_KEYS.map((k) => {
                const on = draft.believed.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(k)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 border px-3.5 font-mono text-[10px] tracking-[0.16em] uppercase transition-colors duration-300",
                      on ? "border-gold text-ink" : "border-line text-ink-3 hover:border-line-2 hover:text-ink-2",
                    )}
                  >
                    {on && <span className="text-[8px] text-gold">◆</span>}
                    {OBSTACLE_LABELS[k]}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-[clamp(2.2rem,6vh,3.6rem)]">
            <Writing
              key={q.key}
              label={typeof q.label === "string" ? q.label : "Answer"}
              value={draft[q.key]}
              onChange={(v) => setDraft((d) => ({ ...d, [q.key]: v }))}
              placeholder={q.key === "stopping" ? `In ${who}'s own words, what gets in the way?` : `${who}…`}
            />
            <p aria-live="polite" className="mt-4 min-h-[1.2rem] font-mono text-[10.5px] tracking-[0.12em] text-gold">
              {slipped ? `◆ Write it about ${who}, not “I”.` : ""}
            </p>
          </div>
        </div>
      );
    }
    if (saved) {
      const v = GAP_COPY[saved.gap.verdict];
      return (
        <div>
          <div className="label">The verdict</div>
          <h2 className="mt-[clamp(1.6rem,4vh,2.6rem)] font-serif text-[clamp(2.8rem,8.4vw,6.4rem)] leading-[1] font-light tracking-[-0.01em] [&_em]:italic">
            {v.big}
          </h2>
          <p className={cn(monoBody, "mt-[clamp(1.6rem,4vh,2.4rem)] max-w-[52ch]")}>{saved.gap.message}</p>

          <div className="mt-[clamp(4rem,11vh,7rem)]">
            <div className="label mb-[clamp(2rem,5vh,3rem)]">The Observer&apos;s case file</div>
            {aiReady ? (
              <CaseFileLoader sessionId={saved.id} name={who} initial={null} auto />
            ) : (
              <div>
                {tell.map((t, i) => (
                  <div key={t.obstacle} className="grid gap-x-[clamp(1.2rem,4vw,3.5rem)] gap-y-3 border-t border-line py-[clamp(1.5rem,3.6vh,2.2rem)] last:border-b md:grid-cols-[2.5rem_minmax(0,1fr)]">
                    <span className="font-mono text-[11px] tracking-[0.1em] text-gold">{String(i + 1).padStart(2, "0")}</span>
                    <p className="max-w-[34ch] font-serif text-[clamp(1.25rem,2.5vw,1.75rem)] leading-[1.3] font-light [&_em]:italic">
                      <IfThen when={t.when} then={t.then} />
                    </p>
                  </div>
                ))}
                {!tell.length && <p className={monoBody}>Nothing to change. Keep doing exactly this — and keep logging.</p>}
                <p className="mt-6 max-w-[52ch] font-mono text-[10.5px] leading-[1.8] tracking-[0.04em] text-ink-4">
                  Add an Anthropic key in Settings and the Observer will write the full case file, with a note to {who}.
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  })();

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Step outside"
          className="fixed inset-0 z-[90] flex flex-col bg-bg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          onKeyDown={onKeyDown}
        >
          {/* Top: mark, progress, close */}
          <div className="px-[clamp(1.5rem,6vw,6rem)] pt-[calc(clamp(1.2rem,3vw,2rem)+var(--safe-top))]">
            <div className="flex items-start justify-between gap-6">
              <div className="font-mono text-[10px] leading-[1.9] tracking-[0.2em] text-ink-4 uppercase">
                <div className="text-[12px] tracking-[0.42em] text-ink">
                  OBSERVER <span className="text-gold">◆</span>
                </div>
                <span className="inline-flex items-center gap-2">
                  <Dot /> Seeing {who} from outside
                </span>
              </div>
              <button type="button" onClick={close} className="font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase transition-colors duration-300 hover:text-ink">
                Close <span aria-hidden>×</span>
              </button>
            </div>
            <div className={cn("mt-[clamp(1.4rem,3.5vh,2.2rem)] grid grid-cols-4 gap-2 transition-opacity duration-700", q ? "opacity-100" : "opacity-0")} aria-hidden={!q}>
              {STEPS.map((s, i) => (
                <i
                  key={s.key}
                  className={cn("block h-px transition-colors duration-700", i < step - 1 ? "bg-ink-3" : i === step - 1 ? "bg-gold" : "bg-line-2")}
                />
              ))}
            </div>
          </div>

          {/* The one question */}
          <div ref={scroller} data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto flex min-h-full w-full max-w-[1040px] flex-col justify-center px-[clamp(1.5rem,6vw,6rem)] py-[clamp(2.5rem,8vh,6rem)]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 26 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.7, ease: EASE }}
                >
                  {screen}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Back / next */}
          <div className="border-t border-line px-[clamp(1.5rem,6vw,6rem)] pt-4 pb-[calc(1rem+var(--safe-bottom))]">
            <div className="mx-auto flex min-h-[52px] max-w-[1040px] items-center justify-between gap-6">
              {step === 0 && <span className="eyebrow max-sm:hidden">Four questions · three minutes</span>}
              {q && (
                <button type="button" onClick={() => setStep(step - 1)} disabled={pending} className={textBtn}>
                  ← Back
                </button>
              )}
              {step === 5 && <span className="eyebrow">Saved to the case file</span>}
              {q && (
                <span className="hidden font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase md:block">
                  {error ? <span className="text-neg normal-case tracking-[0.04em]">{error}</span> : <>⌘ + Enter · next</>}
                </span>
              )}
              <div className="ml-auto">
                {step === 0 && (
                  <Btn variant="primary" size="lg" onClick={begin} disabled={prefsPending}>
                    {prefsPending ? "One moment" : "Begin"} <span aria-hidden>→</span>
                  </Btn>
                )}
                {q && step < 4 && (
                  <button type="button" onClick={next} className={cn(textBtn, "text-ink")}>
                    Next →
                  </button>
                )}
                {step === 4 && (
                  <Btn variant="primary" size="md" onClick={submit} disabled={pending}>
                    {pending ? "Reading the file" : "See it from outside"} <span aria-hidden>→</span>
                  </Btn>
                )}
                {step === 5 && (
                  <Btn variant="primary" size="lg" onClick={close}>
                    Done
                  </Btn>
                )}
              </div>
            </div>
            {q && error && <p className="mt-2 font-mono text-[11px] text-neg md:hidden">{error}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// `window` is a prop name here (the 30/90-day window), so reach the global explicitly.
const window_ = globalThis as unknown as Window & typeof globalThis;
