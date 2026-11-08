"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { evalSetFailed, evalSetsReset, healthTest } from "@/lib/actions/bot";

type Props = { pf60: number | null; n: number; real: number; ok: boolean; changedAt: string | null; failedSets: number; limit: number; window: number[] };

/** PF60 and the eval spend limit: tracking and warnings only, nothing here stops a trade. */
export function Health({ pf60, n, real, ok, changedAt, failedSets, limit, window }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<object>, done: string) =>
    start(async () => {
      const r = await fn();
      setMsg("error" in r && typeof r.error === "string" ? r.error : done);
      router.refresh();
    });
  const pf = pf60 === null ? "∞" : pf60.toFixed(2);
  // Running total of the 60 in the window, for a small line.
  let run_ = 0;
  const eq = window.map((x) => (run_ += x));
  const lo = Math.min(0, ...eq);
  const hi = Math.max(1, ...eq);
  const pts = eq.map((v, i) => `${((i / Math.max(1, eq.length - 1)) * 100).toFixed(1)},${(28 - ((v - lo) / (hi - lo)) * 26).toFixed(1)}`).join(" ");
  const btn = "border border-line px-3 py-1.5 font-mono text-[10.5px] text-ink-3 transition-colors hover:text-ink disabled:opacity-50";
  return (
    <div className="mb-6 grid gap-4 border border-line px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <div className="font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">Strategy health · PF60</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className={cn("num text-[28px] leading-none", ok ? "text-pos" : "text-neg")}>{pf}</span>
          <span className="font-mono text-[11px] text-ink-3">
            {n} trades · {real} real, {n - real} backtest · {ok ? "healthy" : "below 1.0"}
          </span>
        </div>
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-3 h-8 w-full" aria-hidden>
          <polyline points={pts} fill="none" strokeWidth="1.2" vectorEffect="non-scaling-stroke" className={ok ? "stroke-pos" : "stroke-neg"} />
        </svg>
        <p className="mt-2 font-mono text-[10px] leading-[1.7] text-ink-4">
          Profit factor of the last 60 trades (one per signal, dry run or real, at 5 MNQ, after fees). Updates after every closed trade. Below 1.0 you get a push and a Telegram message once, and again when it&apos;s back. Every Sunday at 18:00 UK you get the number. It never pauses the bot.
          {changedAt && ` Last change: ${new Date(changedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`}
        </p>
        <button type="button" className={cn(btn, "mt-3")} disabled={pending} onClick={() => run(healthTest, "Test alert sent: check your phone")}>
          Send a test alert
        </button>
      </div>
      <div>
        <div className="font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">Eval spend limit</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className={cn("num text-[28px] leading-none", failedSets >= limit ? "text-neg" : failedSets ? "text-gold" : "text-ink")}>{failedSets}</span>
          <span className="font-mono text-[11px] text-ink-3">
            failed {failedSets === 1 ? "set" : "sets"} of 5 in a row · limit {limit}
          </span>
        </div>
        <p className="mt-3 font-mono text-[10px] leading-[1.7] text-ink-4">A set fails when none of its 5 evals passes. Mark it here; at {limit} in a row you get a push and a Telegram message to stop buying evals. Only you reset it.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={pending} onClick={() => confirm("Mark a set of 5 evals as failed (none passed)?") && run(evalSetFailed, "Recorded")}>
            A set failed
          </button>
          <button type="button" className={btn} disabled={pending || failedSets === 0} onClick={() => confirm("Reset the failed sets count to 0?") && run(evalSetsReset, "Reset")}>
            Reset (a set passed)
          </button>
        </div>
        {msg && <p className="mt-2 font-mono text-[10.5px] text-ink-3">{pending ? "…" : msg}</p>}
      </div>
    </div>
  );
}
