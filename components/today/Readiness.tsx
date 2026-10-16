"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { saveJournal } from "@/lib/actions/journal";
import type { Readiness as R } from "@/lib/types";
import { Aside, Split } from "./Layout";
import { Rise } from "./Rise";

const METRICS: { key: keyof R; label: string; low: string; high: string }[] = [
  { key: "sleep", label: "Sleep", low: "Wrecked", high: "Rested" },
  { key: "energy", label: "Energy", low: "Flat", high: "Charged" },
  { key: "focus", label: "Focus", low: "Scattered", high: "Locked in" },
  { key: "mood", label: "Mood", low: "Heavy", high: "Light" },
];

export function readinessScore(r: R | null): number | null {
  if (!r) return null;
  return Math.round(((r.sleep + r.energy + r.focus + r.mood - 4) / 16) * 100);
}

function verdict(score: number): React.ReactNode {
  if (score >= 70)
    return (
      <>
        Green light. Trade your <em>plan</em>.
      </>
    );
  if (score >= 45)
    return (
      <>
        Proceed with care — <em>half</em> size.
      </>
    );
  return (
    <>
      Sit out, or trade <em>tiny</em>.
    </>
  );
}

function Scale({ m, value, active, onPick }: { m: (typeof METRICS)[number]; value: number; active: boolean; onPick: (v: number) => void }) {
  const word = !active ? "" : value <= 2 ? m.low : value >= 4 ? m.high : "Steady";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-t border-line py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_6rem] sm:py-2">
      <span className="font-mono text-[10px] tracking-[0.26em] text-ink-3 uppercase">{m.label}</span>
      <span className="text-right font-mono text-[10px] tracking-[0.14em] text-ink-4 uppercase sm:order-last">{word}</span>
      <div role="radiogroup" aria-label={m.label} className="col-span-2 -mx-2 flex justify-between sm:col-span-1 sm:mx-0 sm:justify-start sm:gap-2">
        {[1, 2, 3, 4, 5].map((v) => {
          const on = active && v === value;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${m.label} ${v} of 5`}
              onClick={() => onPick(v)}
              className={cn(
                "relative grid h-11 w-11 place-items-center font-mono text-[15px] font-light transition-colors duration-300",
                on ? "text-ink" : "text-ink-4 hover:text-ink-2",
              )}
            >
              {v}
              <i
                aria-hidden
                className={cn("absolute bottom-[9px] left-1/2 block h-px w-3.5 -translate-x-1/2 bg-pos transition-[opacity,transform] duration-500", on ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0")}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A serif-italic line on a hairline: the one intention for the day. Saves on blur. */
function Intention({ day, initial, big }: { day: string; initial: string | null; big?: boolean }) {
  const [value, setValue] = useState(initial ?? "");
  const [kept, setKept] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const last = useRef((initial ?? "").trim());

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(fit, []);

  const save = () => {
    const v = value.trim();
    if (v === last.current) return;
    last.current = v;
    start(async () => {
      await saveJournal(day, { intention: v || null });
      setKept(true);
      setTimeout(() => setKept(false), 2400);
    });
  };

  return (
    <div>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => {
          setValue(e.target.value.replace(/\n/g, " "));
          fit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onBlur={save}
        placeholder="Two trades max, then walk away."
        aria-label="One intention for today"
        maxLength={500}
        className={cn(
          "block w-full resize-none overflow-hidden border-0 border-b border-line-2 bg-transparent pb-4 font-serif leading-[1.3] font-light tracking-[-0.01em] text-ink italic transition-colors duration-300 placeholder:text-ink-4 focus:border-ink-3 focus:outline-none",
          big ? "text-[clamp(1.5rem,3vw,2.2rem)]" : "text-[1.35rem]",
        )}
      />
      <div className="mt-3 flex items-baseline justify-between gap-4 font-mono text-[9.5px] tracking-[0.24em] uppercase">
        <span className="text-ink-4">Enter to keep it</span>
        <span className={cn("text-gold transition-opacity duration-700", kept ? "opacity-100" : "opacity-0")} aria-live="polite">
          {kept ? "Kept ◆" : ""}
        </span>
      </div>
    </div>
  );
}

/**
 * Mind before market: four 1–5 scales as mono digits, a score, a serif verdict,
 * and the day's intention. `layout="split"` gives the Today editorial asides.
 */
export function Readiness({
  day,
  initial,
  initialIntention,
  insight,
  layout = "stack",
}: {
  day: string;
  initial: R | null;
  initialIntention: string | null;
  insight: string | null;
  layout?: "stack" | "split";
}) {
  const [r, setR] = useState<R>(initial ?? { sleep: 3, energy: 3, focus: 3, mood: 3 });
  const [saved, setSaved] = useState(Boolean(initial));
  const [, start] = useTransition();
  const score = readinessScore(r)!;

  const set = (k: keyof R, v: number) => {
    const next = { ...r, [k]: v };
    setR(next);
    setSaved(true);
    start(async () => {
      await saveJournal(day, { readiness: next });
    });
  };

  const scales = (
    <div className="border-b border-line">
      {METRICS.map((m) => (
        <Scale key={m.key} m={m} value={r[m.key]} active={saved} onPick={(v) => set(m.key, v)} />
      ))}
    </div>
  );

  const statement = (
    <p className="font-serif text-[clamp(1.25rem,2.2vw,1.6rem)] leading-[1.25] font-light tracking-[-0.01em] [&_em]:italic">
      {saved ? (
        verdict(score)
      ) : (
        <>
          How are you showing up <em>today</em>?
        </>
      )}
    </p>
  );

  if (layout === "split") {
    return (
      <div className="space-y-[clamp(4.5rem,11vh,7rem)]">
        <Split
          aside={
            <Aside label="Readiness" figure={saved ? score : <span className="text-ink-4">—</span>} unit={saved ? "/ 100" : undefined} tone={saved && score >= 70 ? "pos" : null}>
              <div className="mt-6 max-w-[20rem]">{statement}</div>
              {insight && <p className="mt-5 max-w-[34ch] font-mono text-[11px] leading-[1.85] tracking-[0.02em] text-ink-3">{insight}</p>}
            </Aside>
          }
        >
          <Rise>{scales}</Rise>
        </Split>
        <Split
          aside={
            <Aside label="Intention">
              <p className="mt-5 max-w-[30ch] font-mono text-[11px] leading-[1.85] tracking-[0.02em] text-ink-3">One sentence you can hold yourself to when the tape gets loud.</p>
            </Aside>
          }
        >
          <Rise className="md:pt-8">
            <Intention day={day} initial={initialIntention} big />
          </Rise>
        </Split>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-7 flex items-end gap-6">
        <div className="shrink-0">
          <div className={cn("num text-[3rem] leading-none font-light tracking-[-0.02em] transition-colors duration-700", saved && score >= 70 && "text-pos")}>{saved ? score : "—"}</div>
          <div className="mt-2 font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">Readiness</div>
        </div>
        <div className="min-w-0 pb-1">
          {statement}
          {insight && <p className="mt-2 font-mono text-[11px] leading-[1.8] text-ink-3">{insight}</p>}
        </div>
      </div>
      {scales}
      <div className="mt-8">
        <div className="mb-3 font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">One intention for today</div>
        <Intention day={day} initial={initialIntention} />
      </div>
    </div>
  );
}
