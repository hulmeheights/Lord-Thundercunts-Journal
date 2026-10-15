"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { markCapsuleOpened } from "@/lib/actions/journal";
import type { Capsule } from "@/lib/types";

const EASE = "cubic-bezier(0.16,1,0.3,1)";

/** A letter from the past, as Meridian's quote: sealed until you open it. */
export function CapsuleCard({ capsule }: { capsule: Capsule }) {
  const [open, setOpen] = useState(Boolean(capsule.openedAt));
  const daysAgo = Math.max(1, Math.round((Date.now() - new Date(capsule.createdAt).getTime()) / 86_400_000));
  const long = capsule.message.length > 180;

  return (
    <figure className="reveal mx-auto max-w-[46rem] text-center">
      <div className="label mb-[clamp(2rem,5vh,3rem)]">Time capsule ◆</div>
      <div className="relative grid">
        <blockquote
          aria-hidden={open}
          className={cn(
            "col-start-1 row-start-1 mx-auto max-w-[22ch] font-serif text-[clamp(1.5rem,3.6vw,2.8rem)] leading-[1.32] font-light tracking-[-0.01em] italic transition-[opacity,filter,transform] duration-700",
            open ? "pointer-events-none -translate-y-2 opacity-0 blur-[6px]" : "opacity-100",
          )}
        >
          A letter from you, sealed {daysAgo} {daysAgo === 1 ? "day" : "days"} ago.
        </blockquote>
        <blockquote
          aria-hidden={!open}
          className={cn(
            "col-start-1 row-start-1 mx-auto font-serif leading-[1.38] font-light tracking-[-0.01em] whitespace-pre-wrap italic transition-[opacity,filter,transform] duration-1000",
            long ? "max-w-[34ch] text-[clamp(1.2rem,2.4vw,1.75rem)]" : "max-w-[24ch] text-[clamp(1.5rem,3.6vw,2.8rem)]",
            open ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0 blur-[8px]",
          )}
          style={{ transitionTimingFunction: EASE, transitionDelay: open ? "250ms" : "0ms" }}
        >
          {open ? `“${capsule.message}”` : ""}
        </blockquote>
      </div>
      <figcaption className="mt-[clamp(2rem,5vh,3rem)]">
        {open ? (
          <span className="font-mono text-[10px] tracking-[0.28em] text-ink-4 uppercase">
            — You, {daysAgo} {daysAgo === 1 ? "day" : "days"} ago
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              void markCapsuleOpened(capsule.id);
            }}
            className="m-link pb-1 font-mono text-[10px] tracking-[0.3em] text-gold uppercase transition-colors duration-300 hover:text-ink"
          >
            Open it ↓
          </button>
        )}
      </figcaption>
    </figure>
  );
}
