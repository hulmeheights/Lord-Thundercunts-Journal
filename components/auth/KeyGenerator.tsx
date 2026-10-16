"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { createSetupEnv, loadSetupEnv, type SetupEnv } from "@/lib/setup-client";

/**
 * Generates the secrets block on this device (Web Crypto) and remembers it
 * locally so the claim screen can auto-fill the setup code. Nothing is sent
 * anywhere; you paste it into Vercel yourself.
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
    <div className="space-y-6 pt-2">
      <div className="border border-gold bg-[rgba(189,158,99,0.03)] p-[clamp(1.2rem,3vw,1.8rem)]">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
          <span className="font-mono text-[9.5px] tracking-[0.3em] text-gold uppercase">Your secrets · made on this device</span>
          <Button size="sm" variant="primary" onClick={() => copy("block", block)} disabled={!v}>
            {copied === "block" ? "● Copied" : "Copy block"}
          </Button>
        </div>
        <pre className="overflow-x-auto font-mono text-[11.5px] leading-[1.9] text-ink">{v ? block : "Generating…"}</pre>
        {!encryptionKeySet && (
          <button
            onClick={() => {
              if (confirm("Generate a new block? Only do this if you haven't pasted the current one into Vercel yet.")) void createSetupEnv().then(setV);
            }}
            className="mt-4 font-mono text-[9.5px] tracking-[0.26em] text-ink-4 uppercase hover:text-ink"
          >
            ↻ Regenerate
          </button>
        )}
      </div>
      {v && (
        <p>
          Your one-time setup code is <span className="num tracking-[0.2em] text-ink">{v.code}</span>{" "}
          <button onClick={() => copy("code", v.code)} className="ml-1 font-mono text-[9.5px] tracking-[0.26em] text-ink-4 uppercase hover:text-ink">
            {copied === "code" ? "● copied" : "copy"}
          </button>
          . This device remembers it and fills it in when you claim the journal.
        </p>
      )}
    </div>
  );
}
