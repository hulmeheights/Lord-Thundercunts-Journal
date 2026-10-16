"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { OBSTACLE_LABELS } from "@/lib/analytics/observer";
import { shortDate } from "@/lib/analytics/time";
import type { ObserverSession } from "@/lib/data/observer";
import { removeObserverSession } from "@/lib/actions/observer";
import { Tag } from "@/components/m";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { CaseFileLoader } from "./CaseFile";
import { GAP_COPY, monoBody, textBtn } from "./ui";

const EASE = [0.16, 1, 0.3, 1] as const;
const GRID = "grid grid-cols-1 gap-x-[clamp(1.2rem,4vw,3.5rem)] md:grid-cols-[4.2rem_minmax(0,0.9fr)_minmax(0,1.5fr)_5.5rem]";

/** Then → now: is the obstacle that led that session shrinking? */
function Trend({ then, now }: { then: number; now: number | undefined }) {
  if (now === undefined) {
    return (
      <span className="text-pos">
        <span aria-hidden>↓ </span>gone from the data now
      </span>
    );
  }
  const diff = now - then;
  if (Math.abs(diff) < Math.max(25, then * 0.1)) return <span className="text-ink-3">about the same now</span>;
  return diff < 0 ? (
    <span className="text-pos">
      <span aria-hidden>↓ </span>
      <span className="num">{fmtMoney(-diff)}</span> smaller now
    </span>
  ) : (
    <span className="text-neg">
      <span aria-hidden>↑ </span>
      <span className="num">{fmtMoney(diff)}</span> bigger now
    </span>
  );
}

function Answer({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pt-5">
      <div className="eyebrow mb-3 !text-[9.5px]">{label}</div>
      {children}
    </div>
  );
}

const said = "max-w-[38ch] font-serif text-[clamp(1.1rem,1.9vw,1.35rem)] leading-[1.45] font-light whitespace-pre-wrap text-ink-2";

function SessionRow({ s, name, nowCost, aiReady, d }: { s: ObserverSession; name: string; nowCost: Record<string, number>; aiReady: boolean; d: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const id = useId();
  const top = s.snapshot.top[0];
  const verdict = GAP_COPY[s.gap?.verdict ?? "unknown"];

  return (
    <div className="reveal border-t border-line" style={{ "--d": `${d}ms` } as React.CSSProperties}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn("m-row group w-full items-baseline gap-y-3 py-[clamp(1.5rem,3.6vh,2.3rem)] text-left", GRID)}
      >
        <span className="font-mono text-[11px] tracking-[0.14em] text-gold uppercase">{shortDate(s.day)}</span>
        <span className="font-serif text-[clamp(1.3rem,2.6vw,1.9rem)] leading-[1.2] font-normal tracking-[-0.01em] [&_em]:italic">{verdict.big}</span>
        <span className="font-mono text-[12px] leading-[1.9] tracking-[0.02em] text-ink-2">
          {top ? (
            <>
              {top.title}, <span className="num">{fmtMoney(top.cost)}</span> then — <Trend then={top.cost} now={nowCost[top.key]} />.
            </>
          ) : (
            s.snapshot.headline
          )}
        </span>
        <span className="font-mono text-[9.5px] tracking-[0.28em] text-ink-4 uppercase transition-colors duration-300 group-hover:text-ink-2 md:text-right">
          {open ? "− Close" : "+ Open"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="pb-[clamp(2.4rem,6vh,4rem)] md:pl-[calc(4.2rem+clamp(1.2rem,4vw,3.5rem))]">
              <div className="eyebrow mb-6 !text-[9.5px]">
                What you wrote · {shortDate(s.from)} – {shortDate(s.to)} · {s.snapshot.sample.trades} trades
              </div>
              <div className="grid grid-cols-1 gap-x-[clamp(1.5rem,4vw,3rem)] gap-y-8 md:grid-cols-2">
                <Answer label={`${name} wants`}>
                  <p className={said}>{s.wants ?? <span className="text-ink-4">—</span>}</p>
                </Answer>
                <Answer label={`${name} is doing`}>
                  <p className={said}>{s.doing ?? <span className="text-ink-4">—</span>}</p>
                </Answer>
                <Answer label={`What's stopping ${name}`}>
                  {s.believed.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {s.believed.map((k) => (
                        <Tag key={k}>{OBSTACLE_LABELS[k]}</Tag>
                      ))}
                    </div>
                  )}
                  {s.stopping ? <p className={said}>{s.stopping}</p> : !s.believed.length && <p className={said}><span className="text-ink-4">—</span></p>}
                </Answer>
                <Answer label={`What you told ${name}`}>
                  <p className={said}>{s.advice ?? <span className="text-ink-4">—</span>}</p>
                </Answer>
              </div>

              {s.gap && (
                <p className="mt-10 max-w-[60ch] border-l border-gold pl-5 font-mono text-[12px] leading-[1.9] tracking-[0.02em] text-ink-2">{s.gap.message}</p>
              )}

              {(aiReady || s.ai) && (
                <div className="mt-[clamp(3rem,8vh,4.5rem)]">
                  <div className="label mb-[clamp(1.8rem,4.5vh,2.6rem)]">The Observer&apos;s case file</div>
                  <CaseFileLoader sessionId={s.id} name={name} initial={s.ai} />
                </div>
              )}

              <div className="mt-[clamp(2.4rem,6vh,3.4rem)] flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
                <div className="flex flex-wrap gap-2">
                  {s.adopted.map((k) => (
                    <Tag key={k} tone="pos">
                      ◆ Adopted · {OBSTACLE_LABELS[k]}
                    </Tag>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm("Delete this entry? The answers and the case file go with it.")) return;
                    start(async () => {
                      await removeObserverSession(s.id);
                      router.refresh();
                    });
                  }}
                  className={cn(textBtn, "border-transparent text-ink-4")}
                >
                  {pending ? "Deleting…" : "Delete this entry"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 05 — every time you stepped outside, newest first, each opening to what was written. */
export function SessionHistory({
  sessions,
  name,
  nowCost,
  aiReady,
}: {
  sessions: ObserverSession[];
  name: string;
  nowCost: Record<string, number>;
  aiReady: boolean;
}) {
  if (!sessions.length) {
    return (
      <div className="reveal border-t border-line py-[clamp(3rem,8vh,5rem)]">
        <p className="max-w-[22ch] font-serif text-[clamp(1.4rem,3vw,2.2rem)] leading-[1.25] font-light [&_em]:italic">
          Nothing on file <em>yet</em>.
        </p>
        <p className={cn(monoBody, "mt-5 max-w-[46ch] text-ink-3")}>
          Each time you step outside, the evidence is saved as it stood — so next month you can see whether the thing in {name}&apos;s way is
          shrinking.
        </p>
      </div>
    );
  }
  return (
    <div className="border-b border-line">
      {sessions.map((s, i) => (
        <SessionRow key={s.id} s={s} name={name} nowCost={nowCost} aiReady={aiReady} d={i * 70} />
      ))}
    </div>
  );
}
