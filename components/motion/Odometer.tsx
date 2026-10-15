"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import { EASE_CSS, prefersReducedMotion } from "@/lib/motion";

const DIGITS = "0123456789";

/**
 * Rolling odometer: every digit is a column of 0–9 that rolls into place,
 * staggered right-to-left, then the figure settles into green (up) or the
 * loss colour (down). Signs are always shown, so colour is never the only cue.
 */
export function Odometer({
  value,
  format = "money",
  sign = true,
  decimals = 0,
  suffix = "",
  className,
  tone = true,
  duration = 1300,
  delay = 0,
  face = "mono",
}: {
  value: number;
  format?: "money" | "number" | "percent" | "ratio";
  sign?: boolean;
  decimals?: number;
  suffix?: string;
  className?: string;
  tone?: boolean;
  duration?: number;
  delay?: number;
  /** "display" uses the headline face for hero figures. */
  face?: "mono" | "display";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setShown(true);
      setSettled(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setSettled(true), delay + duration * 0.85);
    return () => clearTimeout(t);
  }, [shown, delay, duration]);

  let text: string;
  if (format === "money") text = fmtMoney(value, { sign, cents: decimals > 0 });
  else if (format === "percent") text = `${(value * 100).toFixed(decimals)}%`;
  else if (format === "ratio") text = Number.isFinite(value) ? value.toFixed(decimals || 2) : "∞";
  else text = `${sign && value > 0 ? "+" : ""}${value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  text += suffix;

  const chars = [...text];
  const digitCount = chars.filter((c) => DIGITS.includes(c)).length;
  let di = 0;
  const toneClass = !tone || !settled ? "" : value > 0 ? "text-pos" : value < 0 ? "text-neg" : "";

  return (
    <span
      ref={ref}
      className={cn(face === "display" ? "num-display" : "num", "inline-flex items-baseline whitespace-nowrap transition-colors duration-700", toneClass, className)}
      aria-label={text}
    >
      {chars.map((c, i) => {
        if (!DIGITS.includes(c)) {
          return (
            <span key={i} aria-hidden className="inline-block">
              {c}
            </span>
          );
        }
        const d = Number(c);
        const order = digitCount - 1 - di++;
        return (
          <span key={i} aria-hidden className="relative inline-block h-[1em] overflow-hidden leading-none" style={{ width: face === "display" ? "0.6em" : "0.62em" }}>
            <span
              className="absolute inset-x-0 top-0 flex flex-col"
              style={{
                transform: `translateY(${shown ? -d : 0}em)`,
                transition: `transform ${duration}ms ${EASE_CSS} ${delay + order * 70}ms`,
              }}
            >
              {[...DIGITS].map((x) => (
                <span key={x} className="block h-[1em] text-center leading-none">
                  {x}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
