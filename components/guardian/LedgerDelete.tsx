"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteLedgerEntry } from "@/lib/actions/ledger";
import { cn } from "@/lib/cn";

/**
 * A quiet ×. The first tap arms it and a small hairline note appears beside it
 * (below it on desktop, so it never covers the amount); the second tap deletes.
 * No modal, no accidents. It disarms itself after a few seconds or on blur.
 */
export function LedgerDelete({ id, label }: { id: string; label: string }) {
  const [armed, setArmed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3600);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      data-pending={pending ? "true" : undefined}
      aria-label={armed ? `Confirm delete: ${label}` : `Delete ${label}`}
      disabled={pending}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) {
          setFailed(false);
          setArmed(true);
          return;
        }
        start(async () => {
          try {
            const r = await deleteLedgerEntry(id);
            if (!r.ok) setFailed(true);
          } catch {
            setFailed(true);
          }
          setArmed(false);
        });
      }}
      className={cn(
        "relative grid h-7 min-w-7 place-items-center font-mono transition-colors duration-300",
        armed ? "text-ink" : failed ? "text-neg" : "text-ink-4 hover:text-ink",
      )}
    >
      <span className="text-[15px] leading-none" aria-hidden>
        {pending ? "·" : "×"}
      </span>
      {armed && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute z-10 border border-line-2 bg-bg px-2.5 py-1.5 text-[9px] leading-none tracking-[0.22em] whitespace-nowrap uppercase",
            "top-1/2 right-full mr-1.5 -translate-y-1/2",
            "md:top-full md:right-0 md:mt-1 md:mr-0 md:translate-y-0",
          )}
        >
          Tap again to delete
        </span>
      )}
      {failed && !armed && <span className="sr-only">Couldn&apos;t delete — try again.</span>}
    </button>
  );
}
