"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAlertExpiry } from "@/lib/actions/bot";

/** When the TradingView alert runs out: you get a phone reminder 7, 3 and 1 days before and on the day. */
export function AlertExpiry({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [v, setV] = useState(initial ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="border-b border-line py-4">
      <div className="mb-2 font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">TradingView alert expires on</div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          className="field num h-9 w-44 px-2 py-0"
          value={v}
          aria-label="Alert expiry date"
          onChange={(e) => {
            const next = e.target.value;
            setV(next);
            start(async () => {
              const r = await setAlertExpiry(next || null);
              setMsg("error" in r && r.error ? r.error : next ? "Saved: you'll be reminded before it runs out." : "Cleared.");
              router.refresh();
            });
          }}
        />
        {pending && <span className="font-mono text-[10.5px] text-ink-4">Saving…</span>}
        {msg && !pending && <span className="font-mono text-[10.5px] text-ink-3">{msg}</span>}
      </div>
      <p className="mt-2 font-mono text-[10.5px] leading-[1.8] text-ink-4">
        Find it in TradingView: Alerts → your Autopilot alert → Expiration. Each time you renew it, put the new date here.
      </p>
    </div>
  );
}
