"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Link2, LoaderCircle, Sparkles } from "lucide-react";
import { buttonClass, Button } from "@/components/ui/Button";
import { loadSampleData } from "@/lib/actions/settings";

export function Onboarding() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <div className="glass noise relative overflow-hidden rounded-[3px] p-6 sm:p-8">
      <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand opacity-25 blur-3xl" />
      <div className="relative max-w-xl">
        <div className="eyebrow mb-2 text-cyan">Welcome, my Lord</div>
        <h2 className="font-[family-name:var(--font-display)] text-[26px] leading-tight font-bold tracking-[-0.025em] sm:text-[30px]">
          Let&apos;s fill your journal — automatically.
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Connect TopstepX or Tradovate and every trade lands here on its own, already paired into round trips with fees. Read-only, encrypted,
          and impossible to trade from.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/settings#connections" className={buttonClass("primary", "lg")}>
            <Link2 size={18} /> Connect a broker
          </Link>
          <Button
            variant="secondary"
            size="lg"
            disabled={pending || done}
            onClick={() =>
              start(async () => {
                await loadSampleData();
                setDone(true);
              })
            }
          >
            {pending ? <LoaderCircle size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {done ? "Sample loaded" : "Explore with sample data"}
          </Button>
        </div>
      </div>
    </div>
  );
}
