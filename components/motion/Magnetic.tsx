"use client";

import { useEffect } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Primary actions marked with data-magnetic softly lean towards the pointer and
 * glow green. One global listener; desktop pointers only; off for reduced motion.
 */
export function MagneticLayer() {
  useEffect(() => {
    if (prefersReducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    let active: HTMLElement | null = null;
    let raf = 0;
    const release = (el: HTMLElement) => {
      el.style.transform = "";
      el.style.removeProperty("--mx");
      el.style.removeProperty("--my");
      el.removeAttribute("data-magnetic-on");
    };
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-magnetic]") as HTMLElement | null;
      if (active && active !== el) {
        release(active);
        active = null;
      }
      if (!el || (el as HTMLButtonElement).disabled) return;
      active = el;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const pull = Number(el.dataset.magnetic) || 0.18;
        el.style.transform = `translate3d(${(dx * pull).toFixed(2)}px, ${(dy * pull).toFixed(2)}px, 0)`;
        el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
        el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
        el.setAttribute("data-magnetic-on", "");
      });
    };
    const onLeave = () => {
      if (active) release(active);
      active = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
