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
      // Quick and light: the wheel moves the page about as far as it normally would, just eased.
      const lenis = new Lenis({ lerp: 0.16, wheelMultiplier: 1.2 });
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
