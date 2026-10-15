"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createSetupEnv, loadSetupEnv, type SetupEnv } from "@/lib/setup-client";

/**
 * Generates the secrets block on this device (Web Crypto) and remembers it
 * locally so the claim screen can auto-fill the setup code. Nothing is sent
 * anywhere — you paste it into Vercel yourself.
 */
export function KeyGenerator({ encryptionKeySet }: { encryptionKeySet: boolean }) {
  const [v, setV] = useState<SetupEnv | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const existing = loadSetupEnv();
    if (existing) setV(existing);
    else void createSetupEnv().then(setV);
  }, []);

  const block = v ? `ENCRYPTION_KEY=${v.encryptionKey}\nCRON_SECRET=${v.cronSecret}` : "";
  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div className="space-y-4">
      <div className="glass rounded-[24px] p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold">Your secrets block</div>
            <div className="text-[12.5px] text-ink-3">Generated on this device. Never sent to any server.</div>
          </div>
          <Button size="sm" variant="primary" onClick={() => copy("block", block)} disabled={!v}>
            {copied === "block" ? <Check size={14} /> : <Copy size={14} />} {copied === "block" ? "Copied" : "Copy block"}
          </Button>
        </div>
        <pre className="overflow-x-auto rounded-2xl border border-line bg-fill-2 p-4 text-[12.5px] leading-relaxed text-ink">
          {v ? block : "Generating…"}
        </pre>
        {!encryptionKeySet && (
          <button
            onClick={() => {
              if (confirm("Generate a new block? Only do this if you haven't pasted the current one into Vercel yet.")) void createSetupEnv().then(setV);
            }}
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-3 hover:text-ink"
          >
            <RefreshCw size={12} /> Regenerate
          </button>
        )}
      </div>
      {v && (
        <div className="flex items-center gap-3 rounded-[20px] border border-cyan/25 bg-cyan/[0.06] p-4">
          <KeyRound size={18} className="shrink-0 text-cyan" />
          <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-2">
            Your one-time setup code is <span className="num font-semibold tracking-wider text-ink">{v.code}</span>. This device remembers it and fills it in
            for you when you claim the journal.
          </div>
          <button onClick={() => copy("code", v.code)} className="text-ink-3 hover:text-ink" aria-label="Copy setup code">
            {copied === "code" ? <Check size={15} className="text-pos" /> : <Copy size={15} />}
          </button>
        </div>
      )}
    </div>
  );
}
