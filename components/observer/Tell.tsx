"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Instruction } from "@/lib/analytics/observer";
import type { ObserverWindow } from "@/lib/data/observer";
import type { TradingRules } from "@/lib/types";
import { adoptInstruction, pinOrder, unpinOrder } from "@/lib/actions/observer";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { IfThen, monoBody, textBtn } from "./ui";

/** What "Hold them to it" will change, said before it's pressed. */
function consequence(patch: Partial<TradingRules> | null, checklist: string | null): string | null {
  const rules: string[] = [];
  if (patch?.maxTradesPerDay != null) rules.push(`a ${patch.maxTradesPerDay}-trade daily limit`);
  if (patch?.maxContracts != null) rules.push(`a ${patch.maxContracts}-contract cap`);
  if (patch?.cooldownMinutesAfterLoss != null) rules.push(`a ${patch.cooldownMinutesAfterLoss}-minute cool-down after a loss`);
  if (patch?.stopAfterConsecutiveLosses != null) rules.push(`a stop after ${patch.stopAfterConsecutiveLosses} losses in a row`);
  const bits = [rules.length ? `${rules.join(" and ")} to the rules` : null, checklist ? `“${checklist}” to the evening checklist` : null].filter(Boolean);
  return bits.length ? `Adds ${bits.join(", and ")}. Rules only ever get stricter.` : null;
}

export function TellItem({
  ins,
  index,
  name,
  window,
  sessionId,
  pinned,
}: {
  ins: Instruction;
  index: number;
  name: string;
  window: ObserverWindow;
  sessionId: string | null;
  pinned: boolean;
}) {
  const router = useRouter();
  const [adopting, startAdopt] = useTransition();
  const [pinning, startPin] = useTransition();
  const [applied, setApplied] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPinned = pinned;
  const said = consequence(ins.rulesPatch, ins.checklist);

  const adopt = () =>
    startAdopt(async () => {
      setError(null);
      const r = await adoptInstruction({ sessionId, obstacle: ins.obstacle, window });
      if ("error" in r && r.error) setError(r.error);
      else if ("applied" in r && r.applied) setApplied(r.applied);
    });

  const pin = () =>
    startPin(async () => {
      setError(null);
      const r = isPinned ? await unpinOrder() : await pinOrder({ obstacle: ins.obstacle, window });
      if ("error" in r && r.error) return setError(r.error);
      router.refresh();
    });

  return (
    <article className="reveal border-t border-line py-[clamp(2.4rem,6vh,4rem)]" style={{ "--d": `${index * 80}ms` } as React.CSSProperties}>
      <div className="grid gap-x-[clamp(1.2rem,4vw,3.5rem)] gap-y-5 md:grid-cols-[2.5rem_minmax(0,1fr)]">
        <div className="font-mono text-[11px] tracking-[0.1em] text-gold">{String(index + 1).padStart(2, "0")}</div>
        <div>
          <p className="max-w-[27ch] font-serif text-[clamp(1.55rem,3.4vw,2.6rem)] leading-[1.22] font-light tracking-[-0.01em] [&_em]:italic">
            <IfThen when={ins.when} then={ins.then} />
          </p>

          {ins.backtest && (
            <p className="mt-[clamp(1.4rem,3.5vh,2rem)] max-w-[60ch] font-mono text-[11.5px] leading-[1.9] tracking-[0.04em] text-pos">
              <span className="mr-2 text-[9.5px] tracking-[0.28em] uppercase">Rule Lab</span>“{ins.backtest.label}” would have added{" "}
              <span className="num">{fmtMoney(ins.backtest.delta, { sign: true })}</span> over this window.
            </p>
          )}

          <div className="mt-[clamp(1.6rem,4vh,2.4rem)] flex flex-wrap items-center gap-x-9 gap-y-4">
            {(ins.rulesPatch || ins.checklist) && !applied && (
              <button type="button" onClick={adopt} disabled={adopting} className={cn(textBtn, "text-ink-2")}>
                {adopting ? "Writing it in…" : <>Hold {name} to it →</>}
              </button>
            )}
            {isPinned ? (
              <span className="inline-flex items-center gap-6">
                <a href="#order" className="font-mono text-[10px] tracking-[0.28em] text-gold uppercase">
                  ◆ Today&apos;s order
                </a>
                <button type="button" onClick={pin} disabled={pinning} className={textBtn}>
                  {pinning ? "…" : "Unpin"}
                </button>
              </span>
            ) : (
              <button type="button" onClick={pin} disabled={pinning} className={textBtn}>
                {pinning ? "Pinning…" : "Pin as today's order"}
              </button>
            )}
          </div>

          {said && !applied && <p className="mt-4 max-w-[60ch] font-mono text-[10.5px] leading-[1.8] tracking-[0.03em] text-ink-4">{said}</p>}
          {applied && (
            <ul className="mt-5 space-y-1.5">
              {applied.map((a) => (
                <li key={a} className="font-mono text-[11.5px] leading-[1.8] tracking-[0.03em] text-pos">
                  <span className="mr-2.5 text-[8px]">◆</span>
                  {a}
                </li>
              ))}
            </ul>
          )}
          {error && <p className={cn(monoBody, "mt-4 text-ink-3")}>{error}</p>}
        </div>
      </div>
    </article>
  );
}

/** The quiet "Unpin" on the order panel. */
export function UnpinButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await unpinOrder();
          router.refresh();
        })
      }
      className="font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase transition-colors duration-300 hover:text-ink disabled:opacity-40"
    >
      {pending ? "Unpinning…" : "Unpin"}
    </button>
  );
}
