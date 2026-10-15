"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import type { Obstacle } from "@/lib/analytics/observer";
import { Tag } from "@/components/m";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

const EASE = [0.16, 1, 0.3, 1] as const;
const GRID = "grid grid-cols-1 gap-x-[clamp(1.2rem,4vw,3.5rem)] md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.4fr)_7.5rem]";

/** One obstacle as a Meridian row: gold index · serif title · mono detail · the cost. Opens to the evidence. */
function ObstacleRow({ o, rank, max, d }: { o: Obstacle; rank: number; max: number; d: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const share = Math.max(0.04, Math.min(1, o.cost / max));
  return (
    <div className="reveal border-t border-line" style={{ "--d": `${d}ms` } as React.CSSProperties}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn("m-row group w-full items-baseline gap-y-3 py-[clamp(1.5rem,3.6vh,2.3rem)] text-left", GRID)}
      >
        <span className="flex items-baseline justify-between md:contents">
          <span className="font-mono text-[11px] tracking-[0.1em] text-gold">{String(rank).padStart(2, "0")}</span>
          <span className="md:order-1 md:text-right">
            <span className="num block text-[clamp(1.15rem,1.9vw,1.45rem)] font-light text-neg">−{fmtMoney(o.cost)}</span>
            {/* A hairline share of the biggest leak — read the ranking at a glance. */}
            <span className="mt-2.5 ml-auto hidden h-px w-full bg-line md:block" aria-hidden>
              <i className="ml-auto block h-px bg-neg/70" style={{ width: `${share * 100}%` }} />
            </span>
          </span>
        </span>
        <span className="font-serif text-[clamp(1.3rem,2.6vw,1.9rem)] leading-[1.2] font-normal tracking-[-0.01em]">{o.title}</span>
        <span className="font-mono text-[12px] leading-[1.9] tracking-[0.02em] text-ink-2">
          {o.detail}
          <span className="mt-3 block font-mono text-[9.5px] tracking-[0.28em] text-ink-4 uppercase transition-colors duration-300 group-hover:text-ink-2">
            {open ? "− Close the evidence" : "+ The evidence"}
          </span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="overflow-hidden"
          >
            <div className={cn(GRID, "pb-[clamp(1.6rem,4vh,2.4rem)]")}>
              <span className="max-md:hidden" />
              <div className="flex flex-wrap gap-2 md:col-span-2">
                {o.evidence.map((e) => (
                  <Tag key={e.label} tone={e.tone === "pos" ? "pos" : e.tone === "neg" ? "neg" : undefined}>
                    {e.label}
                    <span className="ml-2 text-ink">{e.value}</span>
                  </Tag>
                ))}
                <Tag>
                  {o.confidence} confidence · {o.sample} trades
                </Tag>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Obstacles({ list }: { list: Obstacle[] }) {
  const max = Math.max(1, ...list.map((o) => o.cost));
  return (
    <div className="border-b border-line">
      {list.map((o, i) => (
        <ObstacleRow key={o.key} o={o} rank={i + 1} max={max} d={i * 70} />
      ))}
    </div>
  );
}
