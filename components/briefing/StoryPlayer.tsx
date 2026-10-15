"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import type { BriefingWindow, Slide } from "@/lib/analytics/briefing";
import { seenKey } from "@/components/today/StoryRings";
import { SlideView, slideTheme, type AiState } from "./slides";

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

  const theme = slideTheme(slide);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black">
      {/* Blurred stage lighting for large screens */}
      <motion.div
        key={`bg-${index}`}
        className="absolute inset-0 hidden sm:block"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2 }}
        style={{
          background: `radial-gradient(60% 60% at 30% 30%, ${theme[0]}40, transparent 70%), radial-gradient(50% 50% at 75% 70%, ${theme[1]}35, transparent 70%)`,
        }}
      />

      <div className="relative mx-auto flex h-full w-full items-center justify-center sm:py-6">
        <button
          onClick={() => go(-1)}
          className="mr-6 hidden h-11 w-11 place-items-center rounded-full bg-fill-2 text-ink-2 backdrop-blur hover:text-ink disabled:opacity-20 sm:grid"
          disabled={index === 0}
          aria-label="Previous"
        >
          <ChevronLeft size={22} />
        </button>

        <motion.div
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.6 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 120) close();
          }}
          className="noise relative h-full w-full overflow-hidden bg-[#050507] sm:aspect-[9/16] sm:h-[min(92vh,860px)] sm:w-auto sm:rounded-[3px] sm:border sm:border-white/10 sm:shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => holdTimer.current && clearTimeout(holdTimer.current)}
        >
          {/* Animated mesh background */}
          <AnimatePresence>
            <motion.div
              key={`mesh-${index}`}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9 }}
            >
              <div
                className="absolute -top-1/4 -left-1/4 h-[80%] w-[90%] animate-drift rounded-full blur-3xl"
                style={{ background: `radial-gradient(closest-side, ${theme[0]}66, transparent)` }}
              />
              <div
                className="absolute -right-1/4 -bottom-1/4 h-[70%] w-[90%] animate-drift rounded-full blur-3xl"
                style={{ background: `radial-gradient(closest-side, ${theme[1]}55, transparent)`, animationDelay: "-7s" }}
              />
            </motion.div>
          </AnimatePresence>

          {/* Progress */}
          <div className="absolute inset-x-0 top-0 z-20 px-3 pt-[calc(10px+var(--safe-top))]">
            <div className="flex gap-1">
              {slides.map((_, i) => (
                <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-white"
                    style={{ width: `${i < index ? 100 : i === index ? (duration ? progress * 100 : 100) : 0}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-white">{w.title}</div>
                <div className="truncate text-[11.5px] text-white/60">{w.label}</div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPaused((p) => !p)}
                  className="grid h-9 w-9 place-items-center rounded-full text-white/80 hover:bg-white/10"
                  aria-label={paused ? "Play" : "Pause"}
                >
                  {paused ? <Play size={17} /> : <Pause size={17} />}
                </button>
                <button onClick={close} className="grid h-9 w-9 place-items-center rounded-full text-white/80 hover:bg-white/10" aria-label="Close">
                  <X size={19} />
                </button>
              </div>
            </div>
          </div>

          {/* Slide */}
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              className="absolute inset-0 z-10 flex flex-col px-6 pt-[calc(92px+var(--safe-top))] pb-[calc(28px+var(--safe-bottom))] sm:px-8"
              initial={{ opacity: 0, scale: 1.04, filter: "blur(12px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.97, filter: "blur(10px)" }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            >
              <SlideView slide={slide} ai={ai} window={w} onReplay={() => jump(0)} />
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <button
          onClick={() => go(1)}
          className="ml-6 hidden h-11 w-11 place-items-center rounded-full bg-fill-2 text-ink-2 backdrop-blur hover:text-ink disabled:opacity-20 sm:grid"
          disabled={index === slides.length - 1}
          aria-label="Next"
        >
          <ChevronRight size={22} />
        </button>
      </div>
    </div>
  );
}
