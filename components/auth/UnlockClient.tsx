"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, LoaderCircle, ScanFace } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { LogoMark } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { unlockWithPassphrase, type UnlockState } from "@/lib/actions/auth";

export function UnlockClient({ hasPasskeys, passkeyOnly }: { hasPasskeys: boolean; passkeyOnly: boolean }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<UnlockState, FormData>(unlockWithPassphrase, {});
  const [pkError, setPkError] = useState<string | null>(null);
  const [pkBusy, setPkBusy] = useState(false);

  async function unlockWithPasskey() {
    setPkError(null);
    setPkBusy(true);
    try {
      const opt = await fetch("/api/auth/passkey/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "options" }),
      }).then((r) => r.json());
      if (!opt.options) throw new Error(opt.error ?? "Passkey sign-in is unavailable right now.");
      const response = await startAuthentication({ optionsJSON: opt.options });
      const res = await fetch("/api/auth/passkey/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "verify", challengeId: opt.challengeId, response }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Passkey failed");
      router.replace("/");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Passkey failed";
      setPkError(/NotAllowed|abort|cancel/i.test(msg) ? "Cancelled." : msg);
    } finally {
      setPkBusy(false);
    }
  }

  const error = state.error ?? pkError;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-[380px] text-center"
    >
      <motion.div
        className="mx-auto mb-7 w-fit"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <LogoMark size={84} glow />
      </motion.div>
      <h1 className="font-[family-name:var(--font-display)] text-[30px] leading-tight font-bold tracking-[-0.03em]">
        Lord Thundercunts
        <span className="text-brand block">Journal</span>
      </h1>
      <p className="mt-3 text-[14.5px] text-ink-3">Private. Encrypted. Yours alone.</p>

      <div className="mt-9 space-y-3">
        {hasPasskeys && (
          <Button variant="primary" size="lg" className="w-full" onClick={unlockWithPasskey} disabled={pkBusy}>
            {pkBusy ? <LoaderCircle size={18} className="animate-spin" /> : <ScanFace size={19} />}
            Unlock with Face ID / Passkey
          </Button>
        )}

        {!passkeyOnly && (
          <form action={formAction} className="relative">
            <motion.div animate={state.error ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.4 }} key={state.error}>
              <input
                name="passphrase"
                type="password"
                autoComplete="current-password"
                placeholder={hasPasskeys ? "or use your passphrase" : "Passphrase"}
                className="field h-12 rounded-full pr-14 pl-5 text-center"
                autoFocus={!hasPasskeys}
                required
              />
            </motion.div>
            <button
              type="submit"
              disabled={pending}
              className="absolute top-1.5 right-1.5 grid h-9 w-9 place-items-center rounded-full bg-ink text-bg transition-transform active:scale-95 disabled:opacity-50"
              aria-label="Unlock"
            >
              {pending ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={17} />}
            </button>
          </form>
        )}

        <div className="h-5 text-[13px] text-neg" role="alert">
          {error}
        </div>
      </div>

      <p className="mt-6 text-[11.5px] leading-relaxed text-ink-4">
        Broker connections are read-only and encrypted with AES-256-GCM.
        <br />
        Nobody — not even this app — can place a trade with them.
      </p>
    </motion.div>
  );
}
