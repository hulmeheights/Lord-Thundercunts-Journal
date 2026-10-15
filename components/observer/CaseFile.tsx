"use client";

import { motion } from "motion/react";
import { LoaderCircle, Quote, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { ObserverCaseFile } from "@/lib/ai/observer";
import { Button } from "@/components/ui/Button";

type State = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: ObserverCaseFile };

const rise = (i: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 260, damping: 30, delay: 0.08 * i },
});

function Block({ label, color, children, i }: { label: string; color: string; children: React.ReactNode; i: number }) {
  return (
    <motion.div {...rise(i)} className="rounded-2xl border border-line bg-fill/60 p-4">
      <div className="eyebrow mb-1.5" style={{ color }}>{label}</div>
      <div className="text-[14.5px] leading-relaxed text-ink-2">{children}</div>
    </motion.div>
  );
}

export function CaseFileView({ data, name }: { data: ObserverCaseFile; name: string }) {
  return (
    <div className="space-y-3">
      <Block label="Wants" color="#64d2ff" i={0}>{data.wants}</Block>
      <Block label="Is doing" color="#0a84ff" i={1}>
        <ul className="space-y-1.5">
          {data.doing.map((d) => <li key={d}>{d}</li>)}
        </ul>
      </Block>
      <Block label="Is stopped by" color="#ff9f0a" i={2}>{data.stopping}</Block>
      <Block label="Belief vs evidence" color="#ffd60a" i={3}>{data.gap}</Block>
      <Block label={`Tell ${name}`} color="#bf5af2" i={4}>
        <ol className="space-y-2">
          {data.tell.map((t, k) => (
            <li key={k} className="flex gap-2.5">
              <span className="num mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-purple/15 text-[11px] font-bold text-purple">{k + 1}</span>
              <span><span className="text-ink-3">When </span><b className="font-semibold text-ink">{t.when}</b><span className="text-ink-3"> → </span><b className="font-semibold text-ink">{t.then}</b></span>
            </li>
          ))}
        </ol>
      </Block>
      <motion.div {...rise(5)} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo/25 to-purple/15 p-5">
        <Quote size={22} className="mb-2 text-purple/80" />
        <p className="font-[family-name:var(--font-display)] text-[17px] leading-relaxed font-medium">{data.letter}</p>
        <p className="mt-4 text-[13.5px] text-ink-3"><span className="font-semibold text-ink-2">Sit with this:</span> {data.question}</p>
      </motion.div>
    </div>
  );
}

/** Fetches (or reuses) the AI case file for a saved session. */
export function CaseFileLoader({ sessionId, name, initial, auto = false }: { sessionId: string; name: string; initial: ObserverCaseFile | null; auto?: boolean }) {
  const [state, setState] = useState<State>(initial ? { status: "ready", data: initial } : { status: "idle" });

  const load = async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/observer/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: sessionId }) });
      const json = (await res.json()) as { caseFile?: ObserverCaseFile; error?: string; disabled?: boolean };
      if (json.caseFile) setState({ status: "ready", data: json.caseFile });
      else setState({ status: "error", message: json.disabled ? "AI is switched off." : json.error ?? "The Observer is unavailable right now." });
    } catch {
      setState({ status: "error", message: "Couldn't reach the Observer. Check your connection." });
    }
  };

  useEffect(() => {
    if (auto && !initial) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === "ready") return <CaseFileView data={state.data} name={name} />;
  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-fill/60 p-4 text-[14px] text-ink-3">
        <LoaderCircle size={17} className="animate-spin text-purple" /> The Observer is reading {name}&apos;s file…
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" onClick={load}>
        <Sparkles size={14} className="text-purple" /> Ask the Observer to write it up
      </Button>
      {state.status === "error" && <div className="text-[12.5px] text-neg">{state.message}</div>}
    </div>
  );
}
