"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CalendarDays, Sun, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";

export type Stub = { period: "daily" | "weekly" | "monthly"; id: string; hash: string; title: string; label: string; net: number; trades: number };

const META = {
  daily: { name: "Daily", icon: Sun },
  weekly: { name: "Weekly", icon: CalendarDays },
  monthly: { name: "Monthly", icon: Sparkles },
} as const;

export function seenKey(id: string) {
  return `ltj:seen:${id}`;
}

/** Instagram-style story bubbles. A glowing ring means there's something new. */
export function StoryRings({ stubs }: { stubs: Stub[] }) {
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
    <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-1 sm:gap-6">
      {stubs.map((s, i) => {
        const Icon = META[s.period].icon;
        const unseen = !seen[s.id];
        return (
          <motion.div
            key={s.period}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.05 * i }}
          >
            <Link href={`/briefing/${s.period}`} className="group flex w-[86px] flex-col items-center gap-2 sm:w-[96px]">
              <span
                className={cn(
                  "relative grid h-[78px] w-[78px] place-items-center rounded-full p-[3px] transition-transform group-active:scale-95 sm:h-[86px] sm:w-[86px]",
                  unseen ? "bg-brand" : "bg-fill-3",
                )}
              >
                {unseen && <span className="absolute inset-0 animate-pulse-soft rounded-full bg-brand opacity-60 blur-md" />}
                <span className="relative grid h-full w-full place-items-center rounded-full border-[3px] border-black bg-[#111113]">
                  <Icon size={24} className={unseen ? "text-ink" : "text-ink-3"} />
                </span>
              </span>
              <span className="text-[12.5px] font-semibold">{META[s.period].name}</span>
              <span className={cn("num -mt-1.5 text-[11.5px] font-medium", s.trades ? (s.net >= 0 ? "text-pos" : "text-neg") : "text-ink-4")}>
                {s.trades ? fmtMoney(s.net, { sign: true, compact: true }) : "Rest"}
              </span>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
