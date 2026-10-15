"use client";

import { useState, useTransition } from "react";
import { Check, Mail } from "lucide-react";
import { scheduleCapsule } from "@/lib/actions/journal";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";

/** Letters to your future self, delivered inside a future briefing. */
export function CapsuleWriter({ pending }: { pending: number }) {
  const [msg, setMsg] = useState("");
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [sent, setSent] = useState(false);
  const [busy, start] = useTransition();
  return (
    <div>
      <p className="mb-3 text-[13.5px] leading-relaxed text-ink-3">
        Write to future you. It arrives inside your briefing on the day it&apos;s due.{" "}
        {pending > 0 && <span className="text-orange">{pending} on the way.</span>}
      </p>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} maxLength={4000} placeholder="Remember why you started. Remember today's lesson…" className="field" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented size="sm" value={days} onChange={setDays} options={[{ value: "7", label: "1 week" }, { value: "30", label: "1 month" }, { value: "90", label: "3 months" }]} />
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || !msg.trim()}
          onClick={() =>
            start(async () => {
              await scheduleCapsule(msg, Number(days));
              setMsg("");
              setSent(true);
              setTimeout(() => setSent(false), 2500);
            })
          }
        >
          {sent ? <Check size={14} className="text-pos" /> : <Mail size={14} />} {sent ? "Sealed" : "Seal capsule"}
        </Button>
      </div>
    </div>
  );
}
