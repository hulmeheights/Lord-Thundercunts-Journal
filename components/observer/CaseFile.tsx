"use client";

import { useEffect, useState } from "react";
import type { ObserverCaseFile } from "@/lib/ai/observer";
import { Dot, Row, Rows } from "@/components/m";
import { cn } from "@/lib/cn";
import { IfThen, monoBody, textBtn } from "./ui";

type State = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: ObserverCaseFile };

/** The AI case file: the Observer's letter, then the file itself as rows. */
export function CaseFileView({ data, name }: { data: ObserverCaseFile; name: string }) {
  return (
    <div>
      <figure className="reveal">
        <blockquote className="max-w-[32ch] font-serif text-[clamp(1.35rem,2.8vw,2.1rem)] leading-[1.45] font-light tracking-[-0.01em] italic">
          “{data.letter}”
        </blockquote>
        <figcaption className="mt-7 font-mono text-[10px] tracking-[0.28em] text-ink-4 uppercase">— The Observer, to {name}</figcaption>
      </figure>

      <Rows className="mt-[clamp(3rem,8vh,5rem)]">
        <Row i="01" title="Wants" desc={data.wants} />
        <Row
          i="02"
          title="Is doing"
          desc={
            <ul className="space-y-2.5">
              {data.doing.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          }
        />
        <Row i="03" title="Is stopped by" desc={data.stopping} />
        <Row i="04" title="Belief and evidence" desc={data.gap} />
        <Row
          i="05"
          title={<>Tell {name}</>}
          desc={
            <ol className="space-y-3">
              {data.tell.map((t, k) => (
                <li key={k} className="[&_em]:text-ink [&_em]:not-italic">
                  <IfThen when={t.when} then={t.then} />
                </li>
              ))}
            </ol>
          }
        />
      </Rows>

      <div className="reveal mt-[clamp(3rem,8vh,5rem)]">
        <div className="eyebrow mb-4">Sit with this</div>
        <p className="max-w-[30ch] font-serif text-[clamp(1.25rem,2.4vw,1.7rem)] leading-[1.35] font-light">{data.question}</p>
      </div>
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
      else setState({ status: "error", message: json.disabled ? "AI is switched off in Settings." : (json.error ?? "The Observer is unavailable right now.") });
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
      <p className={cn(monoBody, "flex items-center gap-3 text-ink-3")}>
        <Dot tone="gold" /> The Observer is reading {name}&apos;s file…
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <button type="button" onClick={load} className={textBtn}>
        Ask the Observer to write it up →
      </button>
      {state.status === "error" && <p className={cn(monoBody, "text-ink-3")}>{state.message}</p>}
    </div>
  );
}
