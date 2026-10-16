"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Trade } from "@/lib/types";
import { cn } from "@/lib/cn";
import { removeTrade, saveTradeJournal } from "@/lib/actions/trades";
import { fmtNum } from "@/lib/format";
import { Btn, Dot } from "@/components/m";
import { Seg } from "@/components/m/Seg";
import { Choice } from "./Choice";
import { RATING_WORDS } from "./lib";

type Patch = Parameters<typeof saveTradeJournal>[1];

/** One line of the form: an eyebrow label (and quiet hint) on the left, the control on the right. */
function Line({ label, hint, children, className }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-x-10 gap-y-4 border-b border-line py-[clamp(1.5rem,3.6vh,2.1rem)] md:grid-cols-[12.5rem_minmax(0,1fr)]", className)}>
      <div>
        <div className="font-mono text-[10px] tracking-[0.3em] text-ink-2 uppercase">{label}</div>
        {hint && <div className="mt-1.5 font-mono text-[11px] leading-[1.7] text-ink-4">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TradeEditor({ trade, vocab, defaultRisk }: { trade: Trade; vocab: { setups: string[]; mistakes: string[]; emotions: string[] }; defaultRisk: number | null }) {
  const router = useRouter();
  const [t, setT] = useState(trade);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [, start] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [chartError, setChartError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notes = useRef<HTMLTextAreaElement>(null);

  const save = (patch: Patch, debounce = 0) => {
    setT((cur) => ({ ...cur, ...(patch as Partial<Trade>) }));
    if (timer.current) clearTimeout(timer.current);
    const run = () =>
      start(async () => {
        setSaved("saving");
        await saveTradeJournal(trade.id, patch);
        setSaved("saved");
      });
    if (debounce) timer.current = setTimeout(run, debounce);
    else run();
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // Notes grow with what you write.
  const grow = () => {
    const el = notes.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 192)}px`;
  };
  useEffect(grow, []);

  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const risk = t.plannedRisk ?? defaultRisk;
  const r = risk ? t.netPnl / risk : null;
  const shownRating = hoverRating ?? t.rating ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 border-b border-line-2 pb-4 font-mono text-[9.5px] tracking-[0.28em] uppercase">
        <span className="text-ink-4">Your entry</span>
        <span aria-live="polite" className="inline-flex items-center gap-2.5">
          {saved === "saving" ? (
            <>
              <Dot tone="gold" />
              <span className="text-ink-3">Saving</span>
            </>
          ) : saved === "saved" ? (
            <>
              <Dot tone="pos" pulse={false} />
              <span className="text-pos">Saved</span>
            </>
          ) : (
            <span className="text-ink-4">Saves as you go</span>
          )}
        </span>
      </div>

      <Line label="Setup" hint="Which play was this?">
        <div className="flex flex-wrap gap-2">
          {vocab.setups.map((s) => (
            <Choice key={s} active={t.setup === s} onClick={() => save({ setup: t.setup === s ? null : s })}>
              {s}
            </Choice>
          ))}
        </div>
      </Line>

      <Line label="How it felt" hint="Name it. It loses its grip.">
        <Seg value={t.emotion ?? ""} onChange={(v) => save({ emotion: t.emotion === v ? null : v })} options={vocab.emotions.map((e) => ({ value: e, label: e }))} className="gap-y-3" />
      </Line>

      <Line label="Mistakes" hint="Only the ones you made.">
        <div className="flex flex-wrap gap-2">
          {vocab.mistakes.map((s) => (
            <Choice key={s} tone="neg" active={t.mistakes.includes(s)} onClick={() => save({ mistakes: toggleIn(t.mistakes, s) })}>
              {s}
            </Choice>
          ))}
        </div>
      </Line>

      <Line label="Execution" hint="Grade the process, not the P&L.">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex" onMouseLeave={() => setHoverRating(null)} role="radiogroup" aria-label="Execution rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={t.rating === n}
                aria-label={`${n} of 5 — ${RATING_WORDS[n]}`}
                onMouseEnter={() => setHoverRating(n)}
                onFocus={() => setHoverRating(n)}
                onBlur={() => setHoverRating(null)}
                onClick={() => save({ rating: t.rating === n ? null : n })}
                className={cn(
                  "grid h-10 w-9 place-items-center text-[17px] leading-none transition-[color,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-110",
                  shownRating >= n ? (hoverRating !== null && hoverRating !== t.rating ? "text-gold/70" : "text-gold") : "text-line-2",
                )}
              >
                ◆
              </button>
            ))}
          </div>
          <span className="font-mono text-[10px] tracking-[0.26em] text-ink-3 uppercase">
            {shownRating ? (
              <>
                <span className="num text-ink">{shownRating}</span> / 5 · {RATING_WORDS[shownRating]}
              </>
            ) : (
              "Not rated"
            )}
          </span>
        </div>
      </Line>

      <Line label="Followed the plan" hint="Be honest — it compounds.">
        <Seg
          value={t.followedPlan === true ? "yes" : t.followedPlan === false ? "no" : ""}
          onChange={(v) => {
            const next = v === "yes";
            save({ followedPlan: t.followedPlan === next ? null : next });
          }}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </Line>

      <Line label="Planned risk" hint={defaultRisk ? `Defaults to $${defaultRisk} if left blank.` : "What you were willing to lose."}>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <label className="flex w-44 items-baseline gap-2 border-b border-line-2 transition-colors duration-300 focus-within:border-ink-3">
            <span className="font-mono text-[13px] text-ink-4">$</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              defaultValue={t.plannedRisk ?? ""}
              placeholder={defaultRisk ? String(defaultRisk) : "150"}
              onChange={(e) => save({ plannedRisk: e.target.value ? Math.max(0.01, Number(e.target.value)) : null }, 700)}
              className="num w-full bg-transparent py-2 text-[15px] text-ink outline-none placeholder:text-ink-4"
              aria-label="Planned risk in dollars"
            />
          </label>
          {r !== null && (
            <span className={cn("num pb-2 text-[clamp(1.3rem,2.4vw,1.7rem)] font-light", r > 0 ? "text-pos" : r < 0 ? "text-neg" : "text-ink")}>
              {r > 0 ? "+" : r < 0 ? "−" : ""}
              {fmtNum(Math.abs(r), 2)}
              <span className="ml-1 text-[0.5em] tracking-[0.04em] text-gold">R</span>
            </span>
          )}
        </div>
      </Line>

      <Line label="Chart" hint="A TradingView snapshot link shows up framed above.">
        <input
          type="url"
          defaultValue={t.chartUrl ?? ""}
          placeholder="https://www.tradingview.com/x/…"
          onChange={(e) => {
            const v = e.target.value.trim();
            const ok = !v || /^https:\/\//.test(v);
            setChartError(!ok);
            if (ok) save({ chartUrl: v || null }, 700);
          }}
          className="w-full border-b border-line-2 bg-transparent py-2 font-mono text-[12.5px] tracking-[0.02em] text-ink transition-colors duration-300 outline-none placeholder:text-ink-4 focus:border-ink-3"
          aria-label="Chart link"
        />
        {chartError && <div className="mt-2 font-mono text-[11px] text-ink-3">◆ It needs to be an https:// link.</div>}
      </Line>

      <div className="pt-[clamp(2.5rem,6vh,3.5rem)]">
        <label htmlFor="trade-notes" className="font-mono text-[10px] tracking-[0.3em] text-ink-2 uppercase">
          Notes
        </label>
        <textarea
          id="trade-notes"
          ref={notes}
          defaultValue={t.notes ?? ""}
          onChange={(e) => {
            grow();
            save({ notes: e.target.value || null }, 800);
          }}
          placeholder="Why did you take it? What did you see? What would you do differently?"
          className="mt-5 block min-h-[12rem] w-full resize-none overflow-hidden border-0 border-b border-line-2 bg-transparent pb-5 font-serif text-[clamp(1.2rem,2.2vw,1.55rem)] leading-[1.6] font-light tracking-[-0.005em] text-ink transition-colors duration-300 outline-none placeholder:text-ink-4 placeholder:italic focus:border-ink-3"
        />
      </div>

      {(trade.source === "manual" || trade.source === "sample") && (
        <div className="mt-[clamp(3.5rem,9vh,5.5rem)] flex min-h-10 flex-wrap items-center gap-x-8 gap-y-4">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="m-link pb-1 font-mono text-[9.5px] tracking-[0.28em] text-ink-4 uppercase transition-colors duration-300 hover:text-ink"
            >
              Delete this trade
            </button>
          ) : (
            <>
              <span className="font-mono text-[11px] leading-[1.8] text-ink-3">Gone for good — notes and all.</span>
              <Btn
                variant="secondary"
                size="sm"
                disabled={deleting}
                onClick={() =>
                  startDelete(async () => {
                    await removeTrade(trade.id);
                    router.push("/trades");
                  })
                }
              >
                {deleting ? "Deleting…" : "Yes, delete it"}
              </Btn>
              {!deleting && (
                <button type="button" onClick={() => setConfirmDelete(false)} className="font-mono text-[9.5px] tracking-[0.28em] text-ink-4 uppercase transition-colors duration-300 hover:text-ink">
                  Keep it
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
