"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

export const INTRO_COOKIE = "ltj_intro";

/** Once a day: the name, a line that fills, "establishing connection". */
export function OpeningSequence({ day }: { day: string; greeting?: string; dayNumber?: number; values?: number[] }) {
  const [p, setP] = useState(0);
  const [gone, setGone] = useState(false);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const finish = () => {
      document.cookie = `${INTRO_COOKIE}=${day}; Path=/; Max-Age=172800; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      setP(100);
      setTimeout(() => setGone(true), 260);
      setTimeout(() => setDone(true), 1100);
    };
    if (prefersReducedMotion()) return finish();
    let v = 0;
    const iv = setInterval(() => {
      v = Math.min(92, v + Math.random() * 16);
      setP(v);
    }, 130);
    const t = setTimeout(() => {
      clearInterval(iv);
      finish();
    }, 1900);
    const skip = () => {
      clearInterval(iv);
      clearTimeout(t);
      finish();
    };
    window.addEventListener("pointerdown", skip, { once: true });
    return () => {
      clearInterval(iv);
      clearTimeout(t);
      window.removeEventListener("pointerdown", skip);
    };
  }, [day]);

  if (done) return null;
  return (
    <div
      id="ltj-intro"
      role="presentation"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-[26px] bg-bg transition-opacity duration-[800ms] motion-reduce:hidden"
      style={{ opacity: gone ? 0 : 1, pointerEvents: gone ? "none" : "auto" }}
    >
      {/* <main> is its own stacking context; while the intro is up, lift it over the sidebar, top bar and tab bar. */}
      <style>{"main:has(#ltj-intro){z-index:100}"}</style>
      <div className="font-serif text-[clamp(26px,4vw,42px)] font-light tracking-[0.42em] [text-indent:0.42em]">THUNDERCUNTS</div>
      <div className="relative h-px w-[min(58vw,420px)] bg-line">
        <i className="absolute inset-y-0 left-0 block bg-ink transition-[width] duration-150" style={{ width: `${p}%` }} />
      </div>
      <div className="font-mono text-[10px] tracking-[0.3em] text-ink-4">
        {p >= 100 ? "CONNECTED · 100" : `ESTABLISHING CONNECTION · ${String(Math.floor(p)).padStart(2, "0")}`}
      </div>
    </div>
  );
}
