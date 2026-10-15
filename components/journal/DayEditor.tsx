"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, LoaderCircle, Sparkles } from "lucide-react";
import type { JournalDay, TradingRules } from "@/lib/types";
import { cn } from "@/lib/cn";
import { saveJournal } from "@/lib/actions/journal";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";

type Field = "plan" | "review" | "wins" | "lessons";
const MOODS = ["😣", "😕", "😐", "🙂", "😄"];

export function DayEditor({ day, journal, customRules, aiEnabled }: { day: string; journal: JournalDay; customRules: TradingRules["custom"]; aiEnabled: boolean }) {
  const [j, setJ] = useState(journal);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [, start] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [reflection, setReflection] = useState<{ observations: string[]; question: string; encouragement: string } | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [reflectError, setReflectError] = useState<string | null>(null);

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const persist = (patch: Parameters<typeof saveJournal>[1], key: string, delay: number) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(
      () =>
        start(async () => {
          setStatus("saving");
          await saveJournal(day, patch);
          setStatus("saved");
        }),
      delay,
    );
  };

  const setText = (field: Field, value: string) => {
    setJ((cur) => ({ ...cur, [field]: value }));
    persist({ [field]: value || null }, field, 800);
  };

  const reflect = async () => {
    setReflecting(true);
    setReflectError(null);
    try {
      const res = await fetch("/api/journal/reflect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ day }),
      });
      const json = await res.json();
      if (json.reflection) setReflection(json.reflection);
      else setReflectError(json.error ?? (json.disabled ? "Add ANTHROPIC_API_KEY to enable AI reflections." : "Couldn't reflect right now."));
    } catch {
      setReflectError("Couldn't reach the coach.");
    } finally {
      setReflecting(false);
    }
  };

  const area = (field: Field, label: string, placeholder: string, rows = 4) => (
    <label className="block">
      <span className="eyebrow mb-2 block">{label}</span>
      <textarea value={j[field] ?? ""} onChange={(e) => setText(field, e.target.value)} placeholder={placeholder} rows={rows} className="field" />
    </label>
  );

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-end text-[12px] text-ink-3">
        {status === "saving" ? "Saving…" : status === "saved" ? (
          <span className="inline-flex items-center gap-1 text-pos">
            <Check size={13} /> Saved
          </span>
        ) : "Autosaves as you write"}
      </div>

      {area("plan", "Pre-market plan", "Bias, key levels, what you'll trade, what you won't, max loss…", 5)}
      {area("wins", "What went well", "Patience on the first setup, cut the loser fast…", 3)}
      {area("lessons", "What I'll do better", "One concrete change for next session…", 3)}
      {area("review", "Session review", "Walk through the day honestly. What did you see, feel and do?", 6)}

      <section>
        <div className="eyebrow mb-3">Mood after the session</div>
        <div className="flex gap-2">
          {MOODS.map((m, i) => (
            <button
              key={m}
              onClick={() => {
                const v = j.moodAfter === i + 1 ? null : i + 1;
                setJ((c) => ({ ...c, moodAfter: v }));
                persist({ moodAfter: v }, "mood", 0);
              }}
              className={cn(
                "grid h-12 w-12 place-items-center rounded-[3px] text-[24px] transition-all",
                j.moodAfter === i + 1 ? "scale-110 bg-fill-3 ring-1 ring-white/20" : "bg-fill opacity-60 hover:opacity-100",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      {customRules.length > 0 && (
        <section>
          <div className="eyebrow mb-1">Rules check</div>
          <p className="mb-3 text-[12.5px] text-ink-3">The ones only you can judge. These feed your Discipline ring.</p>
          <div className="divide-y divide-line rounded-[3px] border border-line bg-fill">
            {customRules.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-[14px]">{r.label}</span>
                <Toggle
                  checked={j.rulesKept[r.id] === true}
                  onChange={(v) => {
                    const next = { ...j.rulesKept, [r.id]: v };
                    setJ((c) => ({ ...c, rulesKept: next }));
                    persist({ rulesKept: next }, "rules", 0);
                  }}
                  label={r.label}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {aiEnabled && (
        <section className="rounded-[3px] border border-purple/25 bg-purple/[0.06] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold">Reflect with Thunder</div>
              <div className="text-[12.5px] text-ink-3">Your AI coach reads today&apos;s entry next to your trades.</div>
            </div>
            <Button variant="brand" size="sm" onClick={reflect} disabled={reflecting}>
              {reflecting ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />} Reflect
            </Button>
          </div>
          <AnimatePresence>
            {reflection && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-3">
                {reflection.observations.map((o) => (
                  <p key={o} className="text-[14.5px] leading-relaxed text-ink">
                    • {o}
                  </p>
                ))}
                <p className="text-[14.5px] leading-relaxed font-semibold text-cyan">{reflection.question}</p>
                <p className="text-[13.5px] text-ink-3">{reflection.encouragement}</p>
              </motion.div>
            )}
          </AnimatePresence>
          {reflectError && <p className="mt-3 text-[13px] text-orange">{reflectError}</p>}
        </section>
      )}
    </div>
  );
}
