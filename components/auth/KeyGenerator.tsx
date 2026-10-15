"use client";

import { useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

function randomKey(bytes = 36) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generates secrets locally in the browser — nothing is sent anywhere. */
export function KeyGenerator() {
  const [keys, setKeys] = useState<{ enc: string; cron: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (label: string, v: string) => {
    await navigator.clipboard.writeText(v);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <div className="glass rounded-[28px] p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">Secure key generator</div>
          <div className="text-[13px] text-ink-3">Generated on this device with the Web Crypto API.</div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setKeys({ enc: randomKey(), cron: randomKey(24) })}>
          <RefreshCw size={14} /> Generate
        </Button>
      </div>
      {keys && (
        <div className="space-y-2">
          {([
            ["ENCRYPTION_KEY", keys.enc],
            ["CRON_SECRET", keys.cron],
          ] as const).map(([label, v]) => (
            <button
              key={label}
              onClick={() => copy(label, v)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-fill px-3.5 py-2.5 text-left hover:bg-fill-2"
            >
              <code className="shrink-0 text-[12px] text-ink-3">{label}</code>
              <code className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{v}</code>
              {copied === label ? <Check size={15} className="text-pos" /> : <Copy size={15} className="text-ink-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
