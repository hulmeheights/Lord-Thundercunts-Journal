"use client";

import { useId, useState } from "react";

/**
 * Older months stay folded so the ledger reads as a page, not a spreadsheet.
 * The rows are server-rendered children; this only decides whether they show.
 */
export function LedgerFold({ count, months, children }: { count: number; months: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <div id={id} hidden={!open}>
        {children}
      </div>
      <div className="mt-[clamp(2.2rem,5vh,3rem)] flex items-center gap-5">
        <i className="block h-px flex-1 bg-line" aria-hidden />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="font-mono text-[10px] tracking-[0.3em] whitespace-nowrap text-ink-3 uppercase transition-colors duration-300 hover:text-ink"
        >
          {open ? "↑ Fold the earlier months" : `↓ ${count} earlier ${count === 1 ? "entry" : "entries"} · ${months} ${months === 1 ? "month" : "months"}`}
        </button>
        <i className="block h-px flex-1 bg-line" aria-hidden />
      </div>
    </>
  );
}
