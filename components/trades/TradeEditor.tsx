"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Star, Trash2 } from "lucide-react";
import type { Trade } from "@/lib/types";
import { cn } from "@/lib/cn";
import { removeTrade, saveTradeJournal } from "@/lib/actions/trades";
import { Chip } from "@/components/ui/Chip";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { fmtNum } from "@/lib/format";

type Patch = Parameters<typeof saveTradeJournal>[1];

export function TradeEditor({ trade, vocab, defaultRisk }: { trade: Trade; vocab: { setups: string[]; mistakes: string[]; emotions: string[] }; defaultRisk: number | null }) {
  const router = useRouter();
  const [t, setT] = useState(trade);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const risk = t.plannedRisk ?? defaultRisk;
  const r = risk ? t.netPnl / risk : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end text-[12px] text-ink-3">
        {saved === "saving" ? "Saving…" : saved === "saved" ? (
          <span className="inline-flex items-center gap-1 text-pos">
            <Check size={13} /> Saved
          </span>
        ) : "Changes save automatically"}
      </div>

      <section>
        <div className="eyebrow mb-2">Setup</div>
        <div className="flex flex-wrap gap-2">
          {vocab.setups.map((s) => (
            <Chip key={s} active={t.setup === s} onClick={() => save({ setup: t.setup === s ? null : s })}>
              {s}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <div className="eyebrow mb-2">How did you feel?</div>
        <div className="flex flex-wrap gap-2">
          {vocab.emotions.map((s) => (
            <Chip key={s} active={t.emotion === s} onClick={() => save({ emotion: t.emotion === s ? null : s })}>
              {s}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <div className="eyebrow mb-2">Mistakes</div>
        <div className="flex flex-wrap gap-2">
          {vocab.mistakes.map((s) => (
            <button
              key={s}
              onClick={() => save({ mistakes: toggleIn(t.mistakes, s) })}
              className={cn(
                "inline-flex h-7 items-center rounded-full border px-3 text-[12.5px] font-medium transition-colors",
                t.mistakes.includes(s) ? "border-neg/40 bg-neg/15 text-neg" : "border-line bg-fill text-ink-2 hover:text-ink",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        <section>
          <div className="eyebrow mb-2">Execution rating</div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => save({ rating: t.rating === n ? null : n })} aria-label={`${n} stars`}>
                <Star size={26} className={cn("transition-colors", (t.rating ?? 0) >= n ? "fill-yellow text-yellow" : "text-ink-4")} />
              </button>
            ))}
          </div>
        </section>
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-fill px-4 py-3">
          <div>
            <div className="text-[14px] font-semibold">Followed my plan</div>
            <div className="text-[12px] text-ink-3">Be honest — it compounds.</div>
          </div>
          <Toggle checked={t.followedPlan === true} onChange={(v) => save({ followedPlan: v })} label="Followed plan" />
        </section>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="eyebrow">Planned risk ($)</span>
          <input
            type="number"
            min="0"
            step="any"
            defaultValue={t.plannedRisk ?? ""}
            placeholder={defaultRisk ? `default ${defaultRisk}` : "e.g. 150"}
            onChange={(e) => save({ plannedRisk: e.target.value ? Math.max(0.01, Number(e.target.value)) : null }, 700)}
            className="field"
          />
          {r !== null && <span className={cn("num text-[12.5px] font-semibold", r >= 0 ? "text-pos" : "text-neg")}>{fmtNum(r, 2)}R</span>}
        </label>
        <label className="space-y-1.5">
          <span className="eyebrow">Chart link (TradingView etc.)</span>
          <input
            type="url"
            defaultValue={t.chartUrl ?? ""}
            placeholder="https://www.tradingview.com/x/…"
            onChange={(e) => {
              const v = e.target.value.trim();
              if (!v || /^https:\/\//.test(v)) save({ chartUrl: v || null }, 700);
            }}
            className="field"
          />
        </label>
      </section>

      <section>
        <div className="eyebrow mb-2">Notes</div>
        <textarea
          defaultValue={t.notes ?? ""}
          onChange={(e) => save({ notes: e.target.value || null }, 800)}
          placeholder="Why did you take it? What did you see? What would you do differently?"
          className="field min-h-[140px]"
        />
      </section>

      {(trade.source === "manual" || trade.source === "sample") && (
        <Button
          variant="danger"
          size="sm"
          onClick={() =>
            start(async () => {
              await removeTrade(trade.id);
              router.push("/trades");
            })
          }
        >
          <Trash2 size={14} /> Delete trade
        </Button>
      )}
    </div>
  );
}
