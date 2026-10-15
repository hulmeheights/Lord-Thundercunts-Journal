"use client";

import { useEffect, useRef } from "react";
import { motionKit, prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";

/**
 * Meridian's manifesto: a serif paragraph whose words light up one by one as
 * you scroll through it. Pass plain text; wrap emphasis in *asterisks*.
 */
export function Manifesto({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const words = el.querySelectorAll<HTMLElement>("[data-w]");
    if (prefersReducedMotion()) {
      words.forEach((w) => (w.style.opacity = "1"));
      return;
    }
    const { gsap } = motionKit();
    const ctx = gsap.context(() => {
      gsap.to(words, { opacity: 1, stagger: 0.05, ease: "none", scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 55%", scrub: 0.6 } });
    }, el);
    return () => ctx.revert();
  }, [text]);

  return (
    <p ref={ref} className={cn("max-w-[22ch] font-serif text-[clamp(1.7rem,4.4vw,3.4rem)] leading-[1.42] font-light tracking-[-0.01em]", className)}>
      {parts.map((p, i) => {
        if (p.startsWith("*") && p.endsWith("*")) {
          return (
            <em key={i} data-w className="italic opacity-[0.14]">
              {p.slice(1, -1)}
            </em>
          );
        }
        return p.split(/(\s+)/).map((tok, j) =>
          tok.trim() === "" ? (
            tok
          ) : (
            <span key={`${i}-${j}`} data-w className="opacity-[0.14]">
              {tok}
            </span>
          ),
        );
      })}
    </p>
  );
}
