"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import { seenKey, type Stub } from "./StoryRings";

const PERIOD_LABEL = { daily: "Today", weekly: "Week", monthly: "Month" } as const;

/** Week / month replay cues; a gold ◆ marks one you haven't watched yet. */
export function HeroCues({ stubs }: { stubs: Stub[] }) {
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const s: Record<string, boolean> = {};
    for (const st of stubs) {
      try {
        s[st.id] = localStorage.getItem(seenKey(st.id)) === st.hash;
      } catch {
        s[st.id] = false;
      }
    }
    setSeen(s);
  }, [stubs]);

  return (
    <>
      {stubs
        .filter((s) => s.period !== "daily")
        .map((s) => (
          <Link
            key={s.period}
            href={`/briefing/${s.period}`}
            className="inline-flex items-baseline gap-2 font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase transition-colors duration-300 hover:text-ink"
          >
            <span className={cn("text-gold transition-opacity duration-500", seen[s.id] && "opacity-0")} aria-hidden>
              ◆
            </span>
            {PERIOD_LABEL[s.period]}
            {s.trades ? (
              <span className={cn("num text-[10.5px] tracking-normal", s.net > 0 ? "text-pos" : s.net < 0 ? "text-neg" : "text-ink-3")}>
                {fmtMoney(s.net, { sign: true, compact: true })}
              </span>
            ) : null}
          </Link>
        ))}
    </>
  );
}
