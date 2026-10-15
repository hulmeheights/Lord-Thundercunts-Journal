"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noopSubscribe = () => () => {};

/** A bottom sheet on phones, a centred panel on larger screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // False on the server and during hydration, true afterwards — so a sheet that
  // starts open (e.g. /trades?import=1) never causes a hydration mismatch.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`glass-strong relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[30px] p-5 pb-[calc(20px+var(--safe-bottom))] sm:rounded-[30px] sm:p-7 ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-fill-3 sm:hidden" />
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="title-lg">{title}</h2>
              <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-fill-2 text-ink-2 hover:text-ink" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
