"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/** Crosshair cursor + live clock, like a terminal. Desktop pointers only. */
export function Hud() {
  const x = useRef<HTMLDivElement>(null);
  const y = useRef<HTMLDivElement>(null);
  const tl = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState("");
  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const tick = () => {
      const d = new Date();
      setClock(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    if (prefersReducedMotion() || !matchMedia("(hover:hover) and (pointer:fine)").matches) return () => clearInterval(iv);
    // Only show the crosshair once the pointer has actually moved, so it never sits parked at 0,0.
    const move = (e: PointerEvent) => {
      if (!document.body.classList.contains("cross-on")) document.body.classList.add("cross-on");
      if (x.current) x.current.style.transform = `translateY(${e.clientY}px)`;
      if (y.current) y.current.style.transform = `translateX(${e.clientX}px)`;
      if (tl.current) {
        tl.current.style.left = `${e.clientX}px`;
      }
      const hot = (e.target as Element)?.closest?.("a,button,[role=button],input,textarea,select");
      const c = hot ? "rgba(189,158,99,0.4)" : "rgba(236,231,221,0.16)";
      if (x.current) x.current.style.background = c;
      if (y.current) y.current.style.background = c;
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      clearInterval(iv);
      window.removeEventListener("pointermove", move);
      document.body.classList.remove("cross-on");
    };
  }, []);
  return (
    <>
      <div ref={x} aria-hidden className="xh pointer-events-none fixed inset-x-0 top-0 z-[60] hidden h-px [.cross-on_&]:block" />
      <div ref={y} aria-hidden className="xh pointer-events-none fixed inset-y-0 left-0 z-[60] hidden w-px [.cross-on_&]:block" />
      <div ref={tl} aria-hidden className="pointer-events-none fixed bottom-0 z-[60] hidden -translate-x-1/2 border border-line bg-bg px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em] text-ink-4 [.cross-on_&]:block">
        {clock}
      </div>
    </>
  );
}
