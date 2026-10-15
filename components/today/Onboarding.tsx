"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, buttonClass } from "@/components/ui/Button";
import { loadSampleData } from "@/lib/actions/settings";

/** First run: an empty journal gets one gold panel and two ways in. */
export function Onboarding() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <section className="reveal mx-auto max-w-[560px] rounded-[3px] border border-gold bg-[rgba(189,158,99,0.03)] p-[clamp(2rem,4vw,3.2rem)]">
      <div className="label mb-6">Welcome, my Lord ◆</div>
      <h2 className="max-w-[16ch] font-serif text-[clamp(1.7rem,3.4vw,2.4rem)] leading-[1.15] font-light tracking-[-0.01em] [&_em]:italic">
        Let&apos;s fill your journal — <em>automatically</em>.
      </h2>
      <p className="mt-5 font-mono text-[12px] leading-[1.9] tracking-[0.02em] text-ink-2">
        Connect TopstepX or Tradovate and every trade lands here on its own, paired into round trips with fees.
      </p>
      <ul className="mt-6 space-y-3 border-t border-line pt-6">
        {["Read-only and encrypted", "Impossible to place a trade from here", "Syncs quietly every time you open it"].map((x) => (
          <li key={x} className="relative pl-[1.4em] font-mono text-[12px] tracking-[0.01em] text-ink">
            <span className="absolute top-[0.25em] left-0 text-[0.7em] text-gold">◆</span>
            {x}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/settings#connections" className={buttonClass("primary", "lg", "w-full sm:w-auto")}>
          Connect a broker
        </Link>
        <Button
          variant="secondary"
          size="lg"
          className="w-full sm:w-auto"
          disabled={pending || done}
          onClick={() =>
            start(async () => {
              await loadSampleData();
              setDone(true);
            })
          }
        >
          {pending ? "Loading…" : done ? "Sample loaded" : "Try sample data"}
        </Button>
      </div>
    </section>
  );
}
