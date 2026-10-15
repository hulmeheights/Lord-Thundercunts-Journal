"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteLedgerEntry } from "@/lib/actions/ledger";
import { cn } from "@/lib/cn";

/** A quiet ×. The first tap arms it, the second deletes — no modal, no accidents. */
export function LedgerDelete({ id, label }: { id: string; label: string }) {
  const [armed, setArmed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3200);
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
        "grid h-7 min-w-7 place-items-center font-mono transition-colors duration-300",
        armed ? "text-ink" : failed ? "text-neg" : "text-ink-4 hover:text-ink",
      )}
    >
      {armed ? (
        <span className="absolute right-0 border border-line-2 bg-bg px-2 py-1 text-[9.5px] tracking-[0.22em] whitespace-nowrap uppercase">Delete?</span>
      ) : (
        <span className="text-[15px] leading-none" aria-hidden>
          {pending ? "·" : "×"}
        </span>
      )}
    </button>
  );
}
