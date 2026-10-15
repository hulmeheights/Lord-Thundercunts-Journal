"use client";

import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { Flip } from "gsap/Flip";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

/** One easing family everywhere: cubic-bezier(0.22, 1, 0.36, 1). */
export const EASE_CSS = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASE_ARR = [0.22, 1, 0.36, 1] as const;
export const DUR = { ui: 0.2, enter: 0.9, cinematic: 1.3 } as const;

let registered = false;
export function motionKit() {
  if (!registered && typeof window !== "undefined") {
    gsap.registerPlugin(CustomEase, Flip, ScrollTrigger, SplitText);
    CustomEase.create("calm", "0.22,1,0.36,1");
    gsap.defaults({ ease: "calm", duration: DUR.enter });
    registered = true;
  }
  return { gsap, Flip, ScrollTrigger, SplitText };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
