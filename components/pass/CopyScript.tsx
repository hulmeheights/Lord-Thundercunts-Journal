"use client";

import { useState } from "react";

/** The whole TradingView script: one button copies it, and it can be read on the page. */
export function CopyScript({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const [open, setOpen] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setState("done");
    } catch {
      setState("failed");
      setOpen(true);
    }
    setTimeout(() => setState("idle"), 2500);
  };
  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className="border border-gold/70 bg-gold/10 px-4 py-3 font-mono text-[11px] tracking-[0.2em] text-ink uppercase">
          {state === "done" ? "Copied ✓" : "Copy the script"}
        </button>
        <button type="button" onClick={() => setOpen(!open)} className="font-mono text-[10.5px] text-ink-4 underline">
          {open ? "Hide it" : "Show it"}
        </button>
        {state === "failed" && <span className="font-mono text-[10.5px] text-neg">Couldn&apos;t copy: select all the text below and copy it.</span>}
      </div>
      {open && (
        <textarea readOnly value={code} onFocus={(e) => e.currentTarget.select()} className="field mt-3 h-80 w-full font-mono text-[10.5px] leading-[1.5]" aria-label="MNQ Pass Plan script" />
      )}
      <p className="mt-2 font-mono text-[10px] text-ink-4">{code.split("\n").length} lines · Pine v5 · paste over everything in a new Pine Editor script.</p>
    </div>
  );
}
