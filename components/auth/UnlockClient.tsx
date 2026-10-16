"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/Button";
import { unlockWithPassphrase, type UnlockState } from "@/lib/actions/auth";
import { cn } from "@/lib/cn";

const RISE = "motion-safe:animate-[ltj-rise_1.1s_cubic-bezier(0.16,1,0.3,1)_both]";
const KEYFRAMES =
  "@keyframes ltj-rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}@keyframes ltj-shake{0%,100%{transform:none}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}";

export function UnlockClient({ hasPasskeys, passkeyOnly, name }: { hasPasskeys: boolean; passkeyOnly: boolean; name: string | null }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<UnlockState, FormData>(unlockWithPassphrase, {});
  const [pkError, setPkError] = useState<string | null>(null);
  const [pkBusy, setPkBusy] = useState(false);

  async function unlockWithPasskey() {
    setPkError(null);
    setPkBusy(true);
    try {
      const opt = await fetch("/api/auth/passkey/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "options" }) }).then((r) => r.json());
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
  const first = (name ?? "").trim().split(/\s+/).pop() || "Lord";
  const at = (d: number) => ({ animationDelay: `${d}ms` }) as React.CSSProperties;

  return (
    <div>
      <style>{KEYFRAMES}</style>
      <div className={cn(RISE, "eyebrow mb-8 !tracking-[0.42em]")}>Locked · only you</div>
      <h1 className={cn(RISE, "font-serif text-[clamp(2.6rem,9vw,4.6rem)] leading-[1] font-light tracking-[-0.01em]")} style={at(80)}>
        Welcome back, <em>{first}</em>.
      </h1>

      <div className={cn(RISE, "mt-14 space-y-8")} style={at(200)}>
        {hasPasskeys && (
          <Button variant="primary" size="lg" className="w-full" onClick={unlockWithPasskey} disabled={pkBusy}>
            {pkBusy ? "Waiting for Face ID…" : "Unlock with Face ID"}
          </Button>
        )}

        {!passkeyOnly && (
          <form action={formAction} key={state.error} style={state.error ? { animation: "ltj-shake .4s" } : undefined}>
            <label className="mb-3 block font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">{hasPasskeys ? "Or the passphrase" : "Passphrase"}</label>
            <div className="flex items-end gap-4 border-b border-line-2 pb-2 transition-colors focus-within:border-gold">
              <input
                name="passphrase"
                type="password"
                autoComplete="current-password"
                aria-label="Passphrase"
                className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-[15px] tracking-[0.2em] text-ink outline-none focus-visible:outline-none"
                autoFocus={!hasPasskeys}
                required
              />
              <button type="submit" disabled={pending} className="pb-1.5 font-mono text-[10px] tracking-[0.3em] text-ink uppercase disabled:opacity-40" aria-label="Unlock">
                {pending ? "…" : "Enter →"}
              </button>
            </div>
          </form>
        )}

        <div className="min-h-5 font-mono text-[11px] text-ink" role="alert">
          {error && (
            <>
              <span className="mr-2 text-gold">◆</span>
              {error}
            </>
          )}
        </div>
      </div>

      <p className={cn(RISE, "mt-6 max-w-[40ch] font-mono text-[10.5px] leading-[1.85] text-ink-4")} style={at(320)}>
        Broker connections are read-only and sealed with AES-256-GCM. Nobody, not even this app, can place a trade with them.
      </p>
    </div>
  );
}
