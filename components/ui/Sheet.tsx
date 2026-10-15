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
            className="absolute inset-0 bg-[rgba(5,5,6,0.82)] backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            data-lenis-prevent
            className={`relative max-h-[92dvh] w-full overflow-y-auto border border-line bg-bg p-6 pb-[calc(24px+var(--safe-bottom))] sm:p-10 ${wide ? "sm:max-w-3xl" : "sm:max-w-xl"}`}
            initial={{ y: 48, opacity: 0, scale: 0.985 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 32, opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mx-auto mb-6 h-px w-10 bg-line-2 sm:hidden" />
            <div className="mb-8 flex items-start justify-between gap-4">
              <h2 className="font-serif text-[clamp(1.6rem,3vw,2.2rem)] leading-[1.15] font-light [&_em]:italic">{title}</h2>
              <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center border border-line text-ink-3 transition-colors hover:border-ink hover:text-ink" aria-label="Close">
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
