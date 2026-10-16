"use client";

import { useState, useTransition } from "react";
import { scheduleCapsule } from "@/lib/actions/journal";
import { Button } from "@/components/ui/Button";
import { Seg } from "@/components/m/Seg";

/** Letters to your future self, delivered inside a future replay. */
export function CapsuleWriter({ pending: _pending }: { pending: number }) {
  const [msg, setMsg] = useState("");
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [sent, setSent] = useState(false);
  const [busy, start] = useTransition();
  return (
    <div>
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={4}
        maxLength={4000}
        placeholder="Remember why you started…"
        aria-label="Message to your future self"
        className="w-full resize-none border-0 border-b border-line-2 bg-transparent pb-3 font-serif text-[clamp(1.1rem,2vw,1.35rem)] leading-[1.6] font-light text-ink outline-none placeholder:text-ink-4 placeholder:italic focus:border-gold"
      />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-5">
        <Seg value={days} onChange={setDays} options={[{ value: "7", label: "1 week" }, { value: "30", label: "1 month" }, { value: "90", label: "3 months" }]} />
        <Button
          variant={msg.trim() ? "primary" : "secondary"}
          disabled={busy || !msg.trim()}
          onClick={() =>
            start(async () => {
              await scheduleCapsule(msg, Number(days));
              setMsg("");
              setSent(true);
              setTimeout(() => setSent(false), 2600);
            })
          }
        >
          {sent ? (
            <>
              <span className="text-pos">◆</span> Sealed
            </>
          ) : busy ? (
            "Sealing…"
          ) : (
            "Seal it"
          )}
        </Button>
      </div>
    </div>
  );
}
