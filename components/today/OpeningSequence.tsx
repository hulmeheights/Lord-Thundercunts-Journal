"use client";

import { useEffect, useRef, useState } from "react";
import { motionKit, prefersReducedMotion } from "@/lib/motion";

export const INTRO_COOKIE = "ltj_intro";

/**
 * First open of the day: black → paper, a single green line draws itself
 * across the screen as your equity curve, then the greeting resolves.
 * About 3.5 seconds; any click or key skips it. Plays once per day.
 */
export function OpeningSequence({ day, greeting, dayNumber, values }: { day: string; greeting: string; dayNumber: number; values: number[] }) {
  const root = useRef<HTMLDivElement>(null);
  const path = useRef<SVGPathElement>(null);
  const glow = useRef<SVGPathElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const finish = () => {
      document.cookie = `${INTRO_COOKIE}=${day}; Path=/; Max-Age=172800; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      setDone(true);
    };
    const el = root.current;
    if (!el || prefersReducedMotion()) {
      finish();
      return;
    }
    const { gsap, SplitText } = motionKit();
    const night = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#fafaf7";
    const len = path.current?.getTotalLength() ?? 1200;
    const ctx = gsap.context(() => {
      const lines = SplitText.create(el.querySelector("[data-greet]")!, { type: "lines", mask: "lines" }).lines;
      gsap.set([path.current, glow.current], { strokeDasharray: len, strokeDashoffset: len });
      gsap.set(lines, { yPercent: 110, filter: "blur(8px)", opacity: 0 });
      const tl = gsap.timeline({ onComplete: finish });
      tl.to(el, { backgroundColor: night, duration: 0.9, ease: "calm" }, 0.15)
        .to([path.current, glow.current], { strokeDashoffset: 0, duration: 1.7, ease: "calm" }, 0.35)
        .to(lines, { yPercent: 0, filter: "blur(0px)", opacity: 1, duration: 1.1, stagger: 0.12, ease: "calm" }, 1.55)
        .to(el.querySelector("[data-line]"), { y: "18vh", scale: 1.08, opacity: 0, duration: 1.1, ease: "calm" }, 2.75)
        .to(el, { opacity: 0, duration: 0.85, ease: "calm" }, 2.95);
      const skip = () => tl.timeScale(6);
      window.addEventListener("pointerdown", skip, { once: true });
      window.addEventListener("keydown", skip, { once: true });
      return () => {
        window.removeEventListener("pointerdown", skip);
        window.removeEventListener("keydown", skip);
      };
    }, el);
    return () => ctx.revert();
  }, [day]);

  if (done) return null;

  const series = values.length >= 2 ? values : [0, 1];
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const span = hi - lo || 1;
  const d = series
    .map((v, i) => `${i ? "L" : "M"}${((i / (series.length - 1)) * 1600).toFixed(1)},${(560 - ((v - lo) / span) * 240).toFixed(1)}`)
    .join(" ");

  return (
    <div
      ref={root}
      role="presentation"
      className="intro-overlay fixed inset-0 z-[95] flex flex-col items-center justify-center overflow-hidden bg-black motion-reduce:hidden"
    >
      <svg data-line viewBox="0 0 1600 800" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs>
          <filter id="intro-glow" x="-5%" y="-50%" width="110%" height="200%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>
        <path ref={glow} d={d} fill="none" stroke="#3ddc97" strokeWidth="10" opacity="0.28" filter="url(#intro-glow)" vectorEffect="non-scaling-stroke" />
        <path ref={path} d={d} fill="none" stroke="#0e7a4f" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      </svg>
      <div data-greet className="display relative px-6 text-center text-[clamp(56px,11vw,168px)] text-ink">
        <div>{greeting}.</div>
        <div className="text-ink-3">Day {dayNumber}.</div>
      </div>
      <div className="eyebrow absolute bottom-[calc(28px+var(--safe-bottom))]">Tap to skip</div>
    </div>
  );
}
