"use client";

import { useId, useState } from "react";
import { LEDGER_MIN_COOKIE } from "@/lib/ui-prefs";


/**
 * The whole list of entries, with one switch to put it away. With hundreds of
 * entries the ledger would otherwise push everything below it off the page.
 * The choice is remembered (a plain cookie, so the page already opens the way
 * you left it). The rows are server-rendered children; this only decides
 * whether they show.
 */
export function LedgerList({ count, months, initialMin, children }: { count: number; months: number; initialMin: boolean; children: React.ReactNode }) {
  const [min, setMin] = useState(initialMin);
  const id = useId();
  const toggle = () => {
    const next = !min;
    setMin(next);
    document.cookie = `${LEDGER_MIN_COOKIE}=${next ? 1 : 0}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  };
  return (
    <>
      <div className="mt-[clamp(2rem,5vh,2.8rem)] flex items-center gap-5">
        <span className="font-mono text-[10px] tracking-[0.3em] whitespace-nowrap text-ink-4 uppercase">
          {min ? `${count} ${count === 1 ? "entry" : "entries"} put away` : `Across ${months} ${months === 1 ? "month" : "months"}`}
        </span>
        <i className="block h-px flex-1 bg-line" aria-hidden />
        <button
          type="button"
          aria-expanded={!min}
          aria-controls={id}
          onClick={toggle}
          className="font-mono text-[10px] tracking-[0.3em] whitespace-nowrap text-ink-3 uppercase transition-colors duration-300 hover:text-ink"
        >
          {min ? "↓ Show the entries" : "↑ Minimise"}
        </button>
      </div>
      <div id={id} hidden={min}>
        {children}
      </div>
    </>
  );
}
