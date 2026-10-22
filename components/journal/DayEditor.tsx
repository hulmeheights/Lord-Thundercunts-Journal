"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { JournalDay, TradingRules } from "@/lib/types";
import { cn } from "@/lib/cn";
import { saveJournal } from "@/lib/actions/journal";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/m";
import { Choice } from "@/components/trades/Choice";
import { LIFE_TAGS } from "@/lib/analytics/mind";
import type { SavedReflection } from "@/lib/data/reflections";

type Field = "plan" | "review" | "wins" | "lessons";
const MOODS = ["Rattled", "Off", "Level", "Good", "Clear"];
/** The mood tints the page you're writing on: the caret, the focus line, the rule over the page. */
const TINT = ["var(--ink-2)", "var(--ink-3)", "var(--gold)", "var(--pos)", "var(--pos)"];

const FIELDS: { field: Field; label: string; placeholder: string; rows: number }[] = [
  { field: "plan", label: "The plan", placeholder: "Bias, the levels, what you'll trade, what you won't…", rows: 3 },
  { field: "review", label: "What happened", placeholder: "Walk through it honestly. What did you see, feel, do?", rows: 5 },
  { field: "wins", label: "What went well", placeholder: "Patience on the first setup…", rows: 2 },
  { field: "lessons", label: "What changes tomorrow", placeholder: "One concrete thing…", rows: 2 },
];

/**
 * Writing mode. No boxes: serif on a hairline, autosaving as you type. The
 * mood you pick after the session tints the page.
 */
export function DayEditor({
  day,
  journal,
  customRules,
  aiEnabled,
  reflections: saved = [],
}: {
  day: string;
  journal: JournalDay;
  customRules: TradingRules["custom"];
  aiEnabled: boolean;
  reflections?: SavedReflection[];
}) {
  const [j, setJ] = useState(journal);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [, start] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [reflections, setReflections] = useState<SavedReflection[]>(saved);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(saved[0] ? [saved[0].id] : []));
  const [reflecting, setReflecting] = useState(false);
  const [reflectError, setReflectError] = useState<string | null>(null);

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const persist = (patch: Parameters<typeof saveJournal>[1], key: string, delay: number) => {
    // Anything written now is newer than every saved reflection.
    setReflections((rs) => (rs.some((r) => r.current) ? rs.map((r) => ({ ...r, current: false })) : rs));
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
      const res = await fetch("/api/journal/reflect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day }) });
      const json = await res.json();
      if (json.saved) {
        setReflections((rs) => [json.saved as SavedReflection, ...rs]);
        setOpenIds(new Set([json.saved.id]));
      } else if (json.reflection) setReflectError("Read back, but it couldn't be saved — try again.");
      else setReflectError(json.error ?? (json.disabled ? "Add ANTHROPIC_API_KEY to switch reflections on." : "Couldn't reflect right now."));
    } catch {
      setReflectError("Couldn't reach the coach.");
    } finally {
      setReflecting(false);
    }
  };

  const tint = j.moodAfter ? TINT[j.moodAfter - 1] : "var(--gold)";
  const words = FIELDS.reduce((n, f) => n + (j[f.field]?.trim().split(/\s+/).filter(Boolean).length ?? 0), 0);

  return (
    <div style={{ "--tint": tint } as React.CSSProperties}>
      <div className="mb-[clamp(2.5rem,6vh,4rem)] flex items-center justify-between gap-4 border-t pt-4 transition-colors duration-700" style={{ borderColor: tint }}>
        <span className="font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">
          {words} {words === 1 ? "word" : "words"}
        </span>
        <span className={cn("font-mono text-[9.5px] tracking-[0.3em] uppercase", status === "saved" ? "text-pos" : "text-ink-4")} aria-live="polite">
          {status === "saving" ? "Saving…" : status === "saved" ? "● Saved" : "Autosaves as you write"}
        </span>
      </div>

      <div className="space-y-[clamp(2.6rem,6vh,4rem)]">
        {FIELDS.map((f, i) => (
          <label key={f.field} className="reveal block" style={{ "--d": `${i * 60}ms` } as React.CSSProperties}>
            <Label n={i + 1} className="mb-4 block">
              {f.label}
            </Label>
            <textarea
              value={j[f.field] ?? ""}
              onChange={(e) => setText(f.field, e.target.value)}
              placeholder={f.placeholder}
              rows={f.rows}
              className="field-sizing-content block min-h-[3.2em] w-full resize-none border-0 border-b border-line bg-transparent pb-4 font-serif text-[clamp(1.15rem,2.1vw,1.45rem)] leading-[1.65] font-light tracking-[-0.005em] text-ink outline-none transition-colors duration-500 placeholder:text-ink-4 placeholder:italic focus:border-[var(--tint)] [caret-color:var(--tint)]"
            />
          </label>
        ))}

        <section className="reveal">
          <Label n={5} className="mb-5 block">
            After the bell
          </Label>
          <div className="flex flex-wrap gap-x-7 gap-y-3" role="radiogroup" aria-label="Mood after the session">
            {MOODS.map((m, i) => {
              const on = j.moodAfter === i + 1;
              return (
                <button
                  key={m}
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    const v = on ? null : i + 1;
                    setJ((c) => ({ ...c, moodAfter: v }));
                    persist({ moodAfter: v }, "mood", 0);
                  }}
                  className={cn("group flex items-baseline gap-2.5 pb-1.5 font-mono text-[10.5px] tracking-[0.24em] uppercase transition-colors duration-300", on ? "text-ink" : "text-ink-4 hover:text-ink-2")}
                  style={on ? { boxShadow: `inset 0 -1px 0 ${TINT[i]}` } : undefined}
                >
                  <span className="text-[9px] text-gold">{String(i + 1).padStart(2, "0")}</span>
                  {m}
                </button>
              );
            })}
          </div>
        </section>

        <section className="reveal">
          <Label n={6} className="mb-3 block">
            Outside the charts
          </Label>
          <p className="mb-5 max-w-[48ch] font-mono text-[11.5px] leading-[1.9] text-ink-3">
            What&apos;s going on at home, in your body, in your head? Guardian lines it up against your P&amp;L.
          </p>
          <div className="flex flex-wrap gap-2">
            {[...LIFE_TAGS, ...j.lifeTags.filter((t) => !(LIFE_TAGS as readonly string[]).includes(t))].map((t) => {
              const on = j.lifeTags.includes(t);
              return (
                <Choice
                  key={t}
                  active={on}
                  onClick={() => {
                    const next = on ? j.lifeTags.filter((x) => x !== t) : [...j.lifeTags, t];
                    setJ((c) => ({ ...c, lifeTags: next }));
                    persist({ lifeTags: next }, "life", 0);
                  }}
                >
                  {t}
                </Choice>
              );
            })}
          </div>
          <textarea
            value={j.lifeNote ?? ""}
            onChange={(e) => {
              const v = e.target.value.slice(0, 2000);
              setJ((c) => ({ ...c, lifeNote: v }));
              persist({ lifeNote: v || null }, "lifeNote", 800);
            }}
            placeholder="Anything worth remembering about today, away from the screen…"
            rows={2}
            className="mt-6 field-sizing-content block min-h-[3.2em] w-full resize-none border-0 border-b border-line bg-transparent pb-4 font-serif text-[clamp(1.1rem,1.9vw,1.3rem)] leading-[1.65] font-light text-ink outline-none transition-colors duration-500 placeholder:text-ink-4 placeholder:italic focus:border-[var(--tint)] [caret-color:var(--tint)]"
          />
        </section>

        {customRules.length > 0 && (
          <section className="reveal">
            <Label n={7} className="mb-3 block">
              Rules only you can judge
            </Label>
            <p className="mb-5 max-w-[44ch] font-mono text-[11.5px] leading-[1.9] text-ink-3">These feed your discipline grade.</p>
            <div className="border-t border-line">
              {customRules.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-6 border-b border-line py-4">
                  <span className="font-serif text-[1.15rem] font-light">{r.label}</span>
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
          <section className="reveal border-t border-line pt-8">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <div className="font-serif text-[clamp(1.3rem,2.4vw,1.7rem)] font-light">
                  Read it back to <em>me</em>.
                </div>
                <div className="mt-2 font-mono text-[11.5px] leading-[1.9] text-ink-3">
                  The coach reads this page next to the day&apos;s trades. Every reflection is kept here, so you can compare after you change the page.
                </div>
              </div>
              <Button onClick={reflect} disabled={reflecting}>
                {reflecting ? "Reading…" : reflections.length ? "◆ Reflect again" : "◆ Reflect"}
              </Button>
            </div>
            {reflections.length > 0 && (
              <div className="mt-8 space-y-6">
                {reflections.map((r, i) => {
                  const open = openIds.has(r.id);
                  const when = new Date(r.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
                  return (
                    <article key={r.id} className={cn("border-l pl-6", i === 0 ? "border-gold" : "border-line-2")}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1.5">
                        <button
                          type="button"
                          onClick={() => setOpenIds((s) => (s.has(r.id) ? new Set([...s].filter((x) => x !== r.id)) : new Set([...s, r.id])))}
                          className="font-mono text-[9.5px] tracking-[0.26em] text-ink-3 uppercase hover:text-ink"
                          aria-expanded={open}
                        >
                          {open ? "▾" : "▸"} Read back {when}
                        </button>
                        <span className="flex items-baseline gap-4 font-mono text-[9.5px] tracking-[0.22em] uppercase">
                          {r.current ? <span className="text-pos">● Matches the page now</span> : <span className="text-ink-4">Page changed since</span>}
                          <button
                            type="button"
                            className="text-ink-4 hover:text-ink"
                            onClick={async () => {
                              if (!confirm("Delete this reflection?")) return;
                              await fetch(`/api/journal/reflect?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
                              setReflections((rs) => rs.filter((x) => x.id !== r.id));
                            }}
                          >
                            Delete
                          </button>
                        </span>
                      </div>
                      {open ? (
                        <div className="mt-4 space-y-4" data-private>
                          {r.reflection.observations.map((o) => (
                            <p key={o} className="font-mono text-[12px] leading-[1.9] text-ink-2">
                              {o}
                            </p>
                          ))}
                          <p className="font-serif text-[1.3rem] leading-[1.45] font-light italic">{r.reflection.question}</p>
                          <p className="font-mono text-[11px] leading-[1.9] text-ink-4">{r.reflection.encouragement}</p>
                        </div>
                      ) : (
                        <p className="mt-2 line-clamp-1 font-mono text-[11px] text-ink-4" data-private>
                          {r.reflection.observations[0]}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
            {reflectError && <p className="mt-4 font-mono text-[11px] text-ink-3">{reflectError}</p>}
          </section>
        )}
      </div>
    </div>
  );
}
