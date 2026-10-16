"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { claimJournal, type UnlockState } from "@/lib/actions/auth";
import { computeSetupCode, loadSetupEnv } from "@/lib/setup-client";

const line =
  "w-full border-0 border-b border-line-2 bg-transparent py-2 font-mono text-[13px] tracking-[0.06em] text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-gold focus-visible:outline-none";
const lbl = "mb-2 block font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase";

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
    <div>
      <div className="eyebrow mb-8 !tracking-[0.42em]">First launch · one time</div>
      <h1 className="font-serif text-[clamp(2.4rem,8vw,4.2rem)] leading-[1] font-light tracking-[-0.01em]">
        Make it <em>yours</em>.
      </h1>
      <p className="mt-6 max-w-[38ch] font-mono text-[12px] leading-[1.9] text-ink-2">Prove you own this deployment, then choose the passphrase only you will know.</p>

      <form action={formAction} className="mt-12 space-y-8">
        <input type="hidden" name="code" value={code} />
        <div>
          <label className={lbl} htmlFor="claim-code">
            Setup code {autoFilled && <span className="text-pos">· filled in from this device</span>}
          </label>
          <input id="claim-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" className={`${line} num tracking-[0.3em] uppercase`} autoComplete="off" spellCheck={false} required />
          <button type="button" onClick={() => setFromKey((f) => !f)} className="mt-3 font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase hover:text-ink">
            {fromKey ? "Hide ×" : "Different device? Use ENCRYPTION_KEY →"}
          </button>
          {fromKey && (
            <input value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Paste ENCRYPTION_KEY (stays on this device)" aria-label="Encryption key" className={`${line} mt-3 text-[12px]`} autoComplete="off" spellCheck={false} />
          )}
        </div>
        <div>
          <label className={lbl} htmlFor="claim-pass">
            Passphrase · 12+ characters
          </label>
          <input id="claim-pass" name="passphrase" type="password" autoComplete="new-password" className={line} required minLength={12} />
        </div>
        <div>
          <label className={lbl} htmlFor="claim-confirm">
            Once more
          </label>
          <input id="claim-confirm" name="confirm" type="password" autoComplete="new-password" className={line} required minLength={12} />
        </div>
        <div className="min-h-5 font-mono text-[11px] text-ink" role="alert">
          {state.error && (
            <>
              <span className="mr-2 text-gold">◆</span>
              {state.error}
            </>
          )}
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
          {pending ? "Sealing…" : "Claim it"}
        </Button>
      </form>
      <p className="mt-6 font-mono text-[10.5px] leading-[1.85] text-ink-4">Stored only as a salted scrypt hash. Next you can add Face ID and never type it again.</p>
    </div>
  );
}
