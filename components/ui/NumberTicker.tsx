"use client";

import { animate, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { fmtMoney } from "@/lib/format";

/** Counts up to a value with a soft spring — used for headline numbers. */
export function NumberTicker({
  value,
  format = "money",
  sign = true,
  duration = 1.1,
  className,
  decimals = 0,
  suffix = "",
}: {
  value: number;
  format?: "money" | "number" | "percent";
  sign?: boolean;
  duration?: number;
  className?: string;
  decimals?: number;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value, duration]);

  let text: string;
  if (format === "money") text = fmtMoney(display, { sign, cents: false });
  else if (format === "percent") text = `${(display * 100).toFixed(decimals)}%`;
  else text = display.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return (
    <span ref={ref} className={`num ${className ?? ""}`}>
      {text}
      {suffix}
    </span>
  );
}
