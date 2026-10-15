"use client";

import { useEffect, useRef } from "react";
import { motionKit, prefersReducedMotion } from "@/lib/motion";

type Tag = "h1" | "h2" | "h3" | "p" | "div" | "span";

/**
 * Line-by-line masked reveal: each line rises out of its own mask and sharpens
 * from a slight blur. Server-renders the plain text, so it's readable before JS.
 */
export function RevealText({
  as: As = "div",
  children,
  className,
  delay = 0,
  stagger = 0.09,
  duration = 1.15,
  onScroll = false,
}: {
  as?: Tag;
  children: React.ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
  duration?: number;
  onScroll?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.style.visibility = "visible";
      return;
    }
    const { gsap, SplitText } = motionKit();
    let split: InstanceType<typeof SplitText> | null = null;
    const ctx = gsap.context(() => {
      split = SplitText.create(el, { type: "lines", mask: "lines", linesClass: "split-line-inner", autoSplit: true,
        onSplit(self: InstanceType<typeof SplitText>) {
          return gsap.from(self.lines, {
            yPercent: 105,
            opacity: 0,
            filter: "blur(6px)",
            duration,
            delay,
            stagger,
            ease: "calm",
            scrollTrigger: onScroll ? { trigger: el, start: "top 88%", once: true } : undefined,
          });
        },
      });
    }, el);
    el.style.visibility = "visible";
    return () => {
      ctx.revert();
      split?.revert();
    };
  }, [delay, stagger, duration, onScroll]);
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <As ref={ref as any} className={className} style={{ visibility: "hidden" }}>
      {children}
    </As>
  );
}
