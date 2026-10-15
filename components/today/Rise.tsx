"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The kit's scroll reveal for client components. The global `.reveal`
 * observer can add `.in` before a client component hydrates (a className
 * mismatch); this keeps the same rise — opacity 0, y 26px → in — in React state.
 */
export function Rise({ children, className, d = 0, style }: { children: React.ReactNode; className?: string; d?: number; style?: React.CSSProperties }) {
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
    <div
      ref={ref}
      data-rise={on ? "in" : ""}
      className={className}
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "none" : "translateY(26px)",
        transition: `opacity 1s cubic-bezier(0.16,1,0.3,1) ${d}ms, transform 1s cubic-bezier(0.16,1,0.3,1) ${d}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
