"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBotMode } from "@/lib/actions/bot";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

const MODES = [
  { value: "off", label: "Off", hint: "Signals are logged and skipped. Nothing is traded." },
  { value: "paper", label: "Paper", hint: "Every signal is followed on paper: recorded with its P&L, no orders sent." },
  { value: "live", label: "Live", hint: "Real bracketed orders go to every switched-on account at TopstepX." },
] as const;

/** Off / Paper / Live. Live asks for the word LIVE first. */
export function ModeSwitch({ mode, ready }: { mode: "off" | "paper" | "live"; ready: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [arming, setArming] = useState(false);
  const [word, setWord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const go = (m: "off" | "paper" | "live", confirm = "") =>
    start(async () => {
      setError(null);
      const r = await setBotMode(m, confirm);
      if ("error" in r && r.error) return setError(r.error);
      setArming(false);
      setWord("");
      router.refresh();
    });
  return (
    <div>
      <div className="grid grid-cols-3 border border-line-2" role="radiogroup" aria-label="Autopilot mode">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            disabled={pending}
            onClick={() => (m.value === "live" ? setArming(true) : go(m.value))}
            className={cn(
              "h-14 font-mono text-[11px] tracking-[0.3em] uppercase transition-colors duration-300 [&+&]:border-l [&+&]:border-line-2",
              mode === m.value ? (m.value === "live" ? "bg-neg/15 text-neg" : m.value === "paper" ? "bg-gold/10 text-gold" : "bg-ink/5 text-ink") : "text-ink-4 hover:text-ink",
            )}
          >
            {mode === m.value && "● "}
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-3 font-mono text-[11px] leading-[1.8] text-ink-3">{MODES.find((m) => m.value === mode)!.hint}</p>
      {arming && mode !== "live" && (
        <div className="mt-5 border border-neg/40 p-4">
          <p className="font-mono text-[11.5px] leading-[1.8] text-ink-2">
            Live sends real orders to every switched-on card&apos;s TopstepX account on the next signal.{" "}
            {ready ? "Type LIVE to confirm." : "Finish the setup below first: the webhook secret and TopstepX API key must be set."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="LIVE" aria-label="Type LIVE to confirm" className="field h-9 w-32 font-mono uppercase" />
            <Button variant="danger" size="sm" disabled={pending || word.trim().toUpperCase() !== "LIVE"} onClick={() => go("live", word)}>
              Go live
            </Button>
            <button type="button" onClick={() => setArming(false)} className="font-mono text-[9.5px] tracking-[0.26em] text-ink-4 uppercase hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 font-mono text-[11px] text-neg">{error}</p>}
    </div>
  );
}
