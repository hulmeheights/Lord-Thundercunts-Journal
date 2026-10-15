"use client";

import { useEffect } from "react";
import { motionKit, prefersReducedMotion } from "@/lib/motion";

declare global {
  interface Window {
    __lenis?: { stop: () => void; start: () => void; scrollTo: (t: number | string | HTMLElement, o?: object) => void };
  }
}

/** Lenis smooth scrolling, driven by GSAP's ticker so ScrollTrigger stays in sync. Off for reduced motion and touch. */
export function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion() || window.matchMedia("(pointer: coarse)").matches) return;
    let destroyed = false;
    let cleanup = () => {};
    void import("lenis").then(({ default: Lenis }) => {
      if (destroyed) return;
      const { gsap, ScrollTrigger } = motionKit();
      const lenis = new Lenis({ duration: 1.15, easing: (t: number) => 1 - Math.pow(1 - t, 4), wheelMultiplier: 0.9 });
      window.__lenis = lenis;
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      cleanup = () => {
        gsap.ticker.remove(tick);
        lenis.destroy();
        delete window.__lenis;
      };
    });
    return () => {
      destroyed = true;
      cleanup();
    };
  }, []);
  return null;
}
