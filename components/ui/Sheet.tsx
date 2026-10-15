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
    window.__lenis?.stop();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      window.__lenis?.start();
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
            className="absolute inset-0 bg-[color-mix(in_oklab,var(--ink)_28%,transparent)] backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            data-lenis-prevent
            className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] border border-line bg-surface p-5 pb-[calc(20px+var(--safe-bottom))] shadow-[0_40px_120px_-40px_rgba(11,15,12,0.45)] sm:rounded-[28px] sm:p-8 ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
            initial={{ y: 48, opacity: 0, scale: 0.985 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 32, opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-fill-3 sm:hidden" />
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="title-lg">{title}</h2>
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-line-2 text-ink-2 transition-colors hover:text-ink" aria-label="Close">
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
