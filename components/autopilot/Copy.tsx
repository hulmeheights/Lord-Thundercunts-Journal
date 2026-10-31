"use client";

import { useState } from "react";

/** A value to paste somewhere else, with a copy button. */
export function Copy({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="border-b border-line py-4">
      <div className="mb-2 font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">{label}</div>
      <div className="flex items-start gap-4">
        <code className="min-w-0 flex-1 font-mono text-[11.5px] leading-[1.7] break-all text-ink">{value}</code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            } catch {}
          }}
          className="shrink-0 font-mono text-[9.5px] tracking-[0.26em] text-ink-3 uppercase hover:text-ink"
        >
          {done ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
