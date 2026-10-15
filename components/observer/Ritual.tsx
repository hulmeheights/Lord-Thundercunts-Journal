"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, CircleCheck, CircleHelp, EyeOff, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { OBSTACLE_KEYS, OBSTACLE_LABELS, type ObserverDossier, type ObstacleKey, type PerceptionGap } from "@/lib/analytics/observer";
import type { ObserverWindow } from "@/lib/data/observer";
import type { Settings } from "@/lib/types";
import { saveObserverPrefs, saveObserverSession } from "@/lib/actions/observer";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { CaseFileLoader } from "./CaseFile";

type Draft = { wants: string; doing: string; stopping: string; advice: string; believed: ObstacleKey[] };
type Saved = { id: string; gap: Pick<PerceptionGap, "verdict" | "message"> };

const OBJ = { they: "them", he: "him", she: "her" } as const;

const VERDICT = {
  aligned: { label: "You see clearly", color: "text-pos", bg: "bg-pos/12", Icon: CircleCheck },
  partial: { label: "Half the picture", color: "text-yellow", bg: "bg-yellow/12", Icon: CircleHelp },
  blind: { label: "Blind spot found", color: "text-orange", bg: "bg-orange/12", Icon: EyeOff },
  unknown: { label: "Not enough evidence yet", color: "text-ink-3", bg: "bg-fill-2", Icon: CircleHelp },
} as const;

function Prompt({ step, total, title, hint, children }: { step: number; total: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i < step ? "bg-ink" : "bg-fill-3")} />
        ))}
      </div>
      <h3 className="font-[family-name:var(--font-display)] text-[24px] leading-tight font-bold tracking-[-0.02em]">{title}</h3>
      <p className="mt-1.5 mb-4 text-[13.5px] leading-relaxed text-ink-3">{hint}</p>
      {children}
    </div>
  );
}

export function Ritual({
  open,
  onClose,
  dossier,
  window,
  aiReady,
  prefs,
}: {
  open: boolean;
  onClose: () => void;
  dossier: ObserverDossier;
  window: ObserverWindow;
  aiReady: boolean;
  prefs: Settings["observer"];
}) {
  const router = useRouter();
  const n = dossier.name;
  const obj = OBJ[prefs.pronoun];
  const startersFor = (who: string) => ({ wants: `${who} wants `, doing: `${who} `, stopping: "", advice: `${who}, ` });
  const starters = startersFor(n);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({ ...starters, believed: [] });
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [name, setName] = useState(prefs.name ?? "");
  const [pronoun, setPronoun] = useState(prefs.pronoun);
  const [prefsPending, startPrefs] = useTransition();

  const clean = (k: keyof typeof starters) => {
    const v = draft[k].trim();
    return v === starters[k].trim() ? null : v || null;
  };

  const close = () => {
    onClose();
    if (saved) router.refresh();
    setTimeout(() => {
      setStep(0);
      setSaved(null);
      setError(null);
      setDraft({ ...starters, believed: [] });
    }, 300);
  };

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

  const toggle = (k: ObstacleKey) =>
    setDraft((d) => ({ ...d, believed: d.believed.includes(k) ? d.believed.filter((x) => x !== k) : [...d.believed, k] }));

  const area = (k: "wants" | "doing" | "stopping" | "advice", placeholder: string) => (
    <textarea
      autoFocus
      value={draft[k]}
      onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
      rows={5}
      maxLength={2000}
      placeholder={placeholder}
      className="field min-h-[132px] resize-none text-[15px] leading-relaxed"
    />
  );

  const screens = [
    <div key="intro">
      <div className="mb-5 grid h-14 w-14 place-items-center rounded-3xl bg-indigo/15 text-cyan">
        <EyeOff size={24} />
      </div>
      <h3 className="font-[family-name:var(--font-display)] text-[26px] leading-tight font-bold tracking-[-0.02em]">For three minutes, you&apos;re not you.</h3>
      <p className="mt-3 text-[14.5px] leading-relaxed text-ink-3">
        Picture {n} at the desk this morning: the screens, the first trade, what happened after it. You&apos;re watching from across the room —
        a calm coach who has seen every trade. Write about {n} the way you&apos;d write about someone else.
      </p>
      <div className="mt-5 grid gap-3 rounded-2xl border border-line bg-fill/60 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] text-ink-3">The observer calls you</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={n} maxLength={40} className="field h-10" />
        </label>
        <div>
          <span className="mb-1.5 block text-[12.5px] text-ink-3">Pronouns</span>
          <div className="inline-flex rounded-full border border-line bg-fill p-1">
            {(["they", "he", "she"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPronoun(p)}
                className={cn("rounded-full px-3 py-1 text-[12.5px] font-semibold", pronoun === p ? "bg-ink text-bg" : "text-ink-3")}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Button
        variant="brand"
        size="lg"
        className="mt-6 w-full"
        disabled={prefsPending}
        onClick={() =>
          startPrefs(async () => {
            const nameChanged = (name.trim() || null) !== prefs.name;
            if (nameChanged || pronoun !== prefs.pronoun) {
              await saveObserverPrefs({ name: name.trim() || null, pronoun });
              // The dossier is written with the name and pronoun — refresh it in the background.
              router.refresh();
              if (nameChanged && name.trim()) setDraft({ ...startersFor(name.trim()), believed: draft.believed });
            }
            setStep(1);
          })
        }
      >
        {prefsPending ? <LoaderCircle size={18} className="animate-spin" /> : null} Begin <ArrowRight size={18} />
      </Button>
    </div>,

    <Prompt key="wants" step={1} total={4} title={`What does ${n} want?`} hint="Not just the money. What would this month look like if it went exactly right?">
      {area("wants", `${n} wants…`)}
    </Prompt>,

    <Prompt key="doing" step={2} total={4} title={`What is ${n} actually doing?`} hint="Describe it like a camera would — no excuses, no judgement. What happens after a loss? After a big win?">
      {area("doing", `${n} takes…`)}
    </Prompt>,

    <Prompt key="stopping" step={3} total={4} title={`What's stopping ${n}?`} hint="Pick everything you think is in the way. The observer will check it against the evidence.">
      <div className="mb-3 flex flex-wrap gap-2">
        {OBSTACLE_KEYS.map((k) => {
          const on = draft.believed.includes(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                on ? "border-transparent bg-ink text-bg" : "border-line bg-fill text-ink-2 hover:text-ink",
              )}
            >
              {OBSTACLE_LABELS[k]}
            </button>
          );
        })}
      </div>
      {area("stopping", `In ${n}'s own words, what gets in the way?`)}
    </Prompt>,

    <Prompt key="advice" step={4} total={4} title={`If ${n} were your best mate, what would you tell ${obj}?`} hint="Be as direct and as kind as you'd be with a friend. One or two things that would actually change tomorrow.">
      {area("advice", `${n}, …`)}
    </Prompt>,

    saved ? (
      <div key="reveal">
        {(() => {
          const v = VERDICT[saved.gap.verdict];
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              className={cn("rounded-[24px] p-5", v.bg)}
            >
              <div className={cn("mb-2 flex items-center gap-2 text-[13px] font-bold tracking-wide uppercase", v.color)}>
                <v.Icon size={17} /> {v.label}
              </div>
              <p className="text-[16px] leading-relaxed text-ink">{saved.gap.message}</p>
            </motion.div>
          );
        })()}
        <div className="mt-5">
          <div className="eyebrow mb-2.5">The Observer&apos;s case file</div>
          {aiReady ? (
            <CaseFileLoader sessionId={saved.id} name={n} initial={null} auto />
          ) : (
            <div className="space-y-2">
              {dossier.tell.map((t, i) => (
                <div key={t.obstacle} className="rounded-2xl border border-purple/20 bg-purple/[0.06] p-3.5 text-[14px]">
                  <span className="num mr-2 font-bold text-purple">{i + 1}</span>
                  <span className="text-ink-3">When </span>
                  <b className="font-semibold">{t.when}</b>, <b className="font-semibold">{t.then}</b>
                </div>
              ))}
              <p className="text-[12.5px] text-ink-4">Add an Anthropic key to have the Observer write a full case file and a note to {n}.</p>
            </div>
          )}
        </div>
        <Button variant="primary" size="lg" className="mt-6 w-full" onClick={close}>
          Done
        </Button>
      </div>
    ) : null,
  ];

  return (
    <Sheet open={open} onClose={close} wide title={step === 0 ? "Step outside" : step === 5 ? "From the outside" : `Observing ${n}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {screens[step]}
        </motion.div>
      </AnimatePresence>

      {step >= 1 && step <= 4 && (
        <div className="mt-5 flex items-center gap-3">
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={pending}>
            <ArrowLeft size={16} /> Back
          </Button>
          <div className="flex-1 text-right text-[12.5px] text-neg">{error}</div>
          {step < 4 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              Next <ArrowRight size={16} />
            </Button>
          ) : (
            <Button variant="brand" onClick={submit} disabled={pending}>
              {pending ? <LoaderCircle size={16} className="animate-spin" /> : null} See it from outside <ArrowRight size={16} />
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}
