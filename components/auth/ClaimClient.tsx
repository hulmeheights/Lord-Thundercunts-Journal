"use client";

import { useActionState, useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { claimJournal, type UnlockState } from "@/lib/actions/auth";
import { computeSetupCode, loadSetupEnv } from "@/lib/setup-client";

/** First launch: prove you own the deployment, then choose your passphrase. */
export function ClaimClient() {
  const [state, formAction, pending] = useActionState<UnlockState, FormData>(claimJournal, {});
  const [code, setCode] = useState("");
  const [fromKey, setFromKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [autoFilled, setAutoFilled] = useState(false);

  useEffect(() => {
    const saved = loadSetupEnv();
    if (saved) {
      setCode(saved.code);
      setAutoFilled(true);
    }
  }, []);

  useEffect(() => {
    if (!fromKey || keyInput.trim().length < 32) return;
    void computeSetupCode(keyInput.trim()).then(setCode);
  }, [fromKey, keyInput]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-[400px]"
    >
      <div className="mb-7 text-center">
        <div className="mx-auto mb-6 w-fit">
          <LogoMark size={76} glow />
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] leading-tight font-bold tracking-[-0.03em]">Claim your journal</h1>
        <p className="mt-2 text-[14.5px] text-ink-3">One-time setup. Choose the passphrase only you will know.</p>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="code" value={code} />
        <div>
          <label className="mb-1.5 block text-[12.5px] text-ink-3">
            Setup code {autoFilled && <span className="text-pos">· filled in from this device</span>}
          </label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXX-XXXX-XXXX"
            className="field num text-center tracking-[0.2em] uppercase"
            autoComplete="off"
            spellCheck={false}
            required
          />
          <button type="button" onClick={() => setFromKey((f) => !f)} className="mt-1.5 text-[12px] font-semibold text-ink-3 hover:text-ink">
            {fromKey ? "Hide" : "Different device? Use your ENCRYPTION_KEY instead"}
          </button>
          {fromKey && (
            <input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste ENCRYPTION_KEY (stays on this device)"
              className="field mt-2 text-[13px]"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </div>
        <input name="passphrase" type="password" autoComplete="new-password" placeholder="Choose a passphrase (12+ characters)" className="field" required minLength={12} />
        <input name="confirm" type="password" autoComplete="new-password" placeholder="Type it again" className="field" required minLength={12} />
        <div className="min-h-5 text-[13px] text-neg" role="alert">
          {state.error}
        </div>
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={pending}>
          {pending ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowRight size={18} />} Claim it
        </Button>
      </form>
      <p className="mt-6 text-center text-[11.5px] leading-relaxed text-ink-4">
        Your passphrase is stored only as a salted scrypt hash. Next you can add Face ID so you never type it again.
      </p>
    </motion.div>
  );
}
