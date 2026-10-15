"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Mail } from "lucide-react";
import { markCapsuleOpened } from "@/lib/actions/journal";
import type { Capsule } from "@/lib/types";

export function CapsuleCard({ capsule }: { capsule: Capsule }) {
  const [open, setOpen] = useState(Boolean(capsule.openedAt));
  const daysAgo = Math.max(1, Math.round((Date.now() - new Date(capsule.createdAt).getTime()) / 86_400_000));
  return (
    <div className="glass relative overflow-hidden rounded-[24px] p-6 sm:p-7">
      <div className="relative">
        <div className="eyebrow mb-1.5">Time capsule</div>
        <div className="title-lg">A message from you, {daysAgo} days ago</div>
        <AnimatePresence mode="wait">
          {open ? (
            <motion.p
              key="msg"
              initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              className="display mt-5 text-[22px] leading-snug !tracking-[-0.02em] whitespace-pre-wrap text-ink"
            >
              “{capsule.message}”
            </motion.p>
          ) : (
            <motion.button
              key="btn"
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => {
                setOpen(true);
                void markCapsuleOpened(capsule.id);
              }}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-full border border-line-2 px-4 text-[14px] font-medium text-ink transition-colors hover:border-ink-4"
            >
              <Mail size={16} /> Open it
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
