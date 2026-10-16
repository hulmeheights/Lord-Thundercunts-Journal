"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import type { BriefingWindow, Slide } from "@/lib/analytics/briefing";
import { seenKey } from "@/components/today/StoryRings";
import { cn } from "@/lib/cn";
import { SLIDE_NAMES, SlideView, type AiState } from "./slides";

const DURATION: Record<Slide["kind"], number> = {
  cover: 5500,
  money: 7000,
  scoreboard: 7500,
  curve: 7000,
  calendar: 7500,
  trade: 7500,
  insight: 8500,
  discipline: 8500,
  mind: 7000,
  reportcard: 10000,
  guardian: 8500,
  ai: 14000,
  capsule: 9000,
  focus: 7500,
  observer: 10000,
  outro: 0, // stays until you leave
};

export function StoryPlayer({
  window: w,
  slides,
  hash,
  aiEnabled,
  date,
}: {
  window: BriefingWindow;
  slides: Slide[];
  hash: string;
  aiEnabled: boolean;
  date: string | null;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ai, setAi] = useState<AiState>(aiEnabled ? { status: "loading" } : { status: "disabled" });
  const elapsed = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const slide = slides[index]!;
  const aiWaiting = slide.kind === "ai" && ai.status === "loading";
  const duration = DURATION[slide.kind];

  const close = useCallback(() => router.push("/"), [router]);
  const indexRef = useRef(0);
  const jump = useCallback(
    (n: number) => {
      const next = Math.max(0, Math.min(slides.length - 1, n));
      if (next === indexRef.current) return;
      indexRef.current = next;
      elapsed.current = 0;
      setProgress(0);
      setIndex(next);
    },
    [slides.length],
  );
  const go = useCallback((delta: number) => jump(indexRef.current + delta), [jump]);

  // Mark as seen so the story ring on Today stops glowing.
  useEffect(() => {
    try {
      localStorage.setItem(seenKey(w.id), hash);
    } catch {
      /* private mode */
    }
  }, [w.id, hash]);

  // Prefetch the AI narrative straight away so it's ready when you get there.
  useEffect(() => {
    if (!aiEnabled) return;
    let alive = true;
    fetch("/api/briefing/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ period: w.period, date }),
    })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (!alive) return;
        if (json.disabled) setAi({ status: "disabled" });
        else if (json.briefing) setAi({ status: "ready", data: json.briefing });
        else setAi({ status: "error", message: json.error ?? "The coach is unavailable right now." });
      })
      .catch(() => alive && setAi({ status: "error", message: "Couldn't reach the coach." }));
    return () => {
      alive = false;
    };
  }, [aiEnabled, w.period, date]);

  // Story clock.
  useEffect(() => {
    if (!duration) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!paused && !aiWaiting && document.visibilityState === "visible") {
        elapsed.current += dt;
        const p = Math.min(1, elapsed.current / duration);
        setProgress(p);
        if (p >= 1) {
          go(1);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, paused, aiWaiting, duration, go]);

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, close]);

  const onPointerDown = () => {
    held.current = false;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      setPaused(true);
    }, 220);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (held.current) {
      setPaused(false);
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest("a,button,input,textarea")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.3) go(-1);
    else go(1);
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="stage fixed inset-0 z-50 overflow-hidden bg-bg text-ink" data-lenis-prevent>
      <div aria-hidden className="grain pointer-events-none absolute inset-0" />
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120) close();
        }}
        className="relative flex h-full w-full flex-col px-[clamp(1.25rem,5vw,5rem)] pt-[calc(clamp(1rem,3vh,2rem)+var(--safe-top))] pb-[calc(clamp(1rem,3vh,2rem)+var(--safe-bottom))]"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => holdTimer.current && clearTimeout(holdTimer.current)}
      >
        {/* Chapter rule: one hairline per slide, the current one filling in ink. */}
        <div className="flex gap-1.5" aria-hidden>
          {slides.map((_, i) => (
            <div key={i} className="relative h-px flex-1 bg-line-2">
              <i
                className={cn("absolute inset-y-0 left-0 block", i === index ? "bg-gold" : "bg-ink-2")}
                style={{ width: `${i < index ? 100 : i === index ? (duration ? progress * 100 : 100) : 0}%` }}
              />
            </div>
          ))}
        </div>

        <header className="mt-4 flex items-start justify-between gap-6 font-mono text-[9.5px] tracking-[0.34em] uppercase">
          <div className="min-w-0">
            <div className="text-ink">
              Replay <span className="text-gold">◆</span> <span className="text-ink-3">{w.title}</span>
            </div>
            <div className="mt-1.5 truncate text-ink-4">{w.label}</div>
          </div>
          <div className="flex shrink-0 items-center gap-6">
            <span className="num text-ink-3">
              {pad(index + 1)} / {pad(slides.length)}
            </span>
            <button onClick={() => setPaused((p) => !p)} className="text-ink-3 hover:text-ink" aria-label={paused ? "Play" : "Pause"}>
              {paused ? "▶ Play" : "‖ Pause"}
            </button>
            <button onClick={close} className="text-[13px] tracking-normal text-ink-3 hover:text-ink" aria-label="Close">
              ×
            </button>
          </div>
        </header>

        <div className="relative mx-auto flex min-h-0 w-full max-w-6xl flex-1 py-[clamp(1.5rem,5vh,3.5rem)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              className="flex min-h-0 w-full"
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <SlideView slide={slide} ai={ai} window={w} onReplay={() => jump(0)} />
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="flex items-center justify-between gap-6 font-mono text-[9.5px] tracking-[0.3em] uppercase">
          <span className="text-gold">
            {pad(index + 1)} — <span className="text-ink-3">{SLIDE_NAMES[slide.kind]}</span>
          </span>
          <span className="flex items-center gap-6 text-ink-4">
            <span className="hidden md:inline">← → to move · space to pause · hold to read</span>
            <button onClick={() => go(-1)} disabled={index === 0} className="hover:text-ink disabled:opacity-30" aria-label="Previous">
              ← Back
            </button>
            <button onClick={() => go(1)} disabled={index === slides.length - 1} className="text-ink-2 hover:text-ink disabled:opacity-30" aria-label="Next">
              Next →
            </button>
          </span>
        </footer>
      </motion.div>
    </div>
  );
}
