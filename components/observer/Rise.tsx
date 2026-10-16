"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The kit's rise (opacity 0, y 26px → in), held in React state. Used above the
 * fold, where the global `.reveal` observer can add `.in` before the streamed
 * page hydrates and cause a className mismatch.
 */
export function Rise({
  children,
  className,
  d = 0,
  as: As = "div",
}: {
  children: React.ReactNode;
  className?: string;
  d?: number;
  as?: "div" | "section" | "p";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <As
      ref={ref as React.Ref<never>}
      data-rise={on ? "in" : ""}
      className={className}
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "none" : "translateY(26px)",
        transition: `opacity 1s cubic-bezier(0.16,1,0.3,1) ${d}ms, transform 1s cubic-bezier(0.16,1,0.3,1) ${d}ms`,
      }}
    >
      {children}
    </As>
  );
}
