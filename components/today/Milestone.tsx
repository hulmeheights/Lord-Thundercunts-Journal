"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LivingLine } from "@/components/charts/LivingLine";
import { Odometer } from "@/components/motion/Odometer";
import { cn } from "@/lib/cn";
import { prefersReducedMotion } from "@/lib/motion";

export type Moment = {
  /** Remembered once seen, e.g. "trades-250" or "high-2026-10-15". */
  id: string;
  /** Ids to mark as seen alongside this one (lower thresholds already passed). */
  also?: string[];
  /** Serif line; wrap the italic word in *asterisks*. */
  line: string;
  /** The figure, rolled in by the odometer. */
  value: number;
  format: "money" | "number";
  caption: string;
  sub: string;
  /** Forced by ?moment= — shown even if already seen, and not remembered. */
  preview?: boolean;
};

const KEY = (id: string) => `ltj:moment:${id}`;
const EASE = "cubic-bezier(0.16,1,0.3,1)";

function seen(id: string) {
  try {
    return localStorage.getItem(KEY(id)) !== null;
  } catch {
    return true; // storage blocked: never nag
  }
}

function serif(line: string) {
  return line.split(/(\*[^*]+\*)/g).map((p, i) => (p.startsWith("*") && p.endsWith("*") ? <em key={i}>{p.slice(1, -1)}</em> : p));
}

/**
 * Retention moments: a once-only, full-screen cinematic card when something
 * worth marking happens (trade-count milestones, a new 90-day equity high).
 * Any key, tap or scroll continues; each moment is remembered per device.
 */
export function Milestone({ moments, curve, delay = 900 }: { moments: Moment[]; curve: number[]; delay?: number }) {
  const [m, setM] = useState<Moment | null>(null);
  const [phase, setPhase] = useState<"off" | "in" | "out">("off");
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const forced = moments.find((x) => x.preview);
    // Automated browsers (screenshots, audits) only see a moment when asked for one.
    if (!forced && navigator.webdriver) return;
    const pick = forced ?? moments.find((x) => !seen(x.id));
    if (!pick) return;
    const t = setTimeout(() => {
      setM(pick);
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase("in")));
    }, delay);
    return () => clearTimeout(t);
  }, [moments, delay]);

  const close = useCallback(() => {
    if (!m || phase === "out") return;
    if (!m.preview) {
      try {
        for (const id of [m.id, ...(m.also ?? [])]) localStorage.setItem(KEY(id), new Date().toISOString());
      } catch {
        /* storage blocked */
      }
    }
    setPhase("out");
    setTimeout(() => setM(null), prefersReducedMotion() ? 0 : 900);
  }, [m, phase]);

  useEffect(() => {
    if (!m) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    let armed = false;
    // A short grace period so the tap that loaded the page can't skip the moment.
    const arm = setTimeout(() => {
      armed = true;
      dialog.current?.focus({ preventScroll: true });
    }, 700);
    const go = () => armed && close();
    window.addEventListener("keydown", go);
    window.addEventListener("pointerdown", go);
    window.addEventListener("wheel", go, { passive: true });
    window.addEventListener("touchmove", go, { passive: true });
    return () => {
      clearTimeout(arm);
      html.style.overflow = prev;
      window.removeEventListener("keydown", go);
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("wheel", go);
      window.removeEventListener("touchmove", go);
    };
  }, [m, close]);

  if (!m) return null;
  const now = new Date();
  const stamp = {
    time: now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    date: now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
  };
  const on = phase === "in";
  const rise = (d: number): React.CSSProperties => ({
    opacity: on ? 1 : 0,
    transform: on ? "none" : "translateY(26px)",
    transition: `opacity 1.2s ${EASE} ${on ? d : 0}ms, transform 1.2s ${EASE} ${on ? d : 0}ms`,
  });

  // Portalled to <body>: the app's <main> is its own stacking context, and the
  // moment has to sit above the sidebar, the top bar and the tab bar.
  return createPortal(
    <div
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Milestone"
      className="fixed inset-0 z-[200] outline-none flex flex-col overflow-hidden bg-bg px-6 pt-[calc(1.4rem+var(--safe-top))] pb-[calc(1.6rem+var(--safe-bottom))] sm:px-[clamp(1.5rem,6vw,6rem)]"
      style={{ opacity: phase === "out" ? 0 : on ? 1 : 0, transition: `opacity ${phase === "out" ? 0.8 : 1}s ${EASE}` }}
    >
      <div className="mx-auto flex w-full max-w-[1160px] items-start justify-between gap-6 font-mono text-[10px] tracking-[0.2em] text-ink-4 uppercase" style={rise(150)}>
        <div>
          <div className="text-[12px] tracking-[0.42em] text-ink">
            THUNDER <span className="text-gold">◆</span>
          </div>
          Private journal
        </div>
        <div className="text-right">
          <div className="num text-[12px] tracking-[0.12em] text-ink">{stamp.time}</div>
          {stamp.date}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1160px] flex-1 flex-col justify-center py-10">
        <div className="label mb-[clamp(1.6rem,4vh,2.6rem)]" style={rise(350)}>
          Milestone ◆
        </div>
        <h2
          className="max-w-[14ch] font-serif text-[clamp(2.7rem,8.6vw,7.4rem)] leading-[1] font-light tracking-[-0.01em] [&_em]:italic"
          style={rise(520)}
        >
          {serif(m.line)}
        </h2>
        <div className="my-[clamp(2rem,6vh,3.4rem)]" style={rise(760)}>
          <LivingLine values={curve} height={140} className="max-sm:!h-[96px]" />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6 max-sm:flex-col max-sm:items-start" style={rise(900)}>
          <p className="max-w-[34ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2">{m.sub}</p>
          <div className="text-right max-sm:text-left">
            <Odometer
              value={m.value}
              format={m.format}
              sign={m.format === "money"}
              tone={m.format === "money"}
              delay={1100}
              duration={1600}
              className="text-[clamp(1.8rem,3.4vw,2.6rem)] leading-none font-light tracking-[0.01em]"
            />
            <div className="mt-2 font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase">{m.caption}</div>
          </div>
        </div>
        <div className="mt-[clamp(2.4rem,6vh,3.6rem)] flex flex-wrap items-center gap-x-7 gap-y-4" style={rise(1050)}>
          <button
            type="button"
            onClick={close}
            className={cn(
              "inline-flex h-[52px] items-center border border-ink bg-ink px-9 font-mono text-[11px] tracking-[0.26em] text-bg uppercase",
              "transition-colors duration-300 hover:bg-transparent hover:text-ink",
            )}
          >
            Continue
          </button>
          <span className="font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase">
            <span className="[@media(hover:none)]:hidden">Any key · or click</span>
            <span className="[@media(hover:hover)]:hidden">Or tap anywhere</span>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
