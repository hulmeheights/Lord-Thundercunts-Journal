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
    <div className="glass relative overflow-hidden rounded-[28px] p-6">
      <div className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-[radial-gradient(closest-side,rgba(255,159,10,0.35),transparent)] blur-2xl" />
      <div className="relative">
        <div className="eyebrow mb-1 text-orange">Time capsule</div>
        <div className="title-lg">A message from you, {daysAgo} days ago</div>
        <AnimatePresence mode="wait">
          {open ? (
            <motion.p
              key="msg"
              initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              className="mt-4 text-[16px] leading-relaxed whitespace-pre-wrap text-ink"
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
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange/15 px-4 py-2 text-[14px] font-semibold text-orange"
            >
              <Mail size={16} /> Open it
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
