"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { registerPasskey } from "@/lib/passkey-client";
import { clearSetupEnv } from "@/lib/setup-client";

/** Shown once after claiming: offers Face ID straight away. A hairline strip, not a banner. */
export function Welcome({ hasPasskey }: { hasPasskey: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasPasskey);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => clearSetupEnv(), []);

  if (!open) return null;
  return (
    <section className="reveal relative grid gap-x-10 gap-y-6 border-y border-line py-[clamp(1.8rem,4vh,2.6rem)] md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0 pr-8">
        <div className="label mb-4">It&apos;s yours ◆</div>
        <p className="max-w-[24ch] font-serif text-[clamp(1.4rem,2.6vw,1.9rem)] leading-[1.2] font-light tracking-[-0.01em] [&_em]:italic">
          Now make it <em>effortless</em>.
        </p>
        <p className="mt-3 max-w-[48ch] font-mono text-[12px] leading-[1.9] tracking-[0.02em] text-ink-2">
          Add Face ID or Touch ID and unlock in a glance — phishing-proof.
        </p>
        {msg && <p className="mt-2 font-mono text-[11px] text-gold">{msg}</p>}
      </div>
      <Button
        variant="primary"
        size="lg"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            await registerPasskey();
            setOpen(false);
            router.refresh();
          } catch (e) {
            setMsg(e instanceof Error ? e.message : "Couldn't add Face ID");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Waiting…" : "Add Face ID"}
      </Button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="absolute top-[clamp(1.8rem,4vh,2.6rem)] right-0 font-mono text-[14px] leading-none text-ink-4 transition-colors hover:text-ink"
        aria-label="Dismiss"
      >
        ×
      </button>
    </section>
  );
}
