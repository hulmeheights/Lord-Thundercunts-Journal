"use client";

import { useActionState } from "react";
import { updatePassphrase, type UnlockState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { lineInput, Note, Sub } from "./ui";

export function ChangePassphrase() {
  const [state, action, pending] = useActionState<UnlockState & { ok?: boolean }, FormData>(updatePassphrase, {});
  return (
    <form action={action}>
      <Sub>Change passphrase</Sub>
      <div className="grid gap-5 pt-5 sm:grid-cols-3">
        <input name="current" type="password" autoComplete="current-password" placeholder="Current" aria-label="Current passphrase" className={lineInput} required />
        <input name="next" type="password" autoComplete="new-password" placeholder="New · 12+" aria-label="New passphrase" minLength={12} className={lineInput} required />
        <input name="confirm" type="password" autoComplete="new-password" placeholder="Again" aria-label="Repeat new passphrase" minLength={12} className={lineInput} required />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-5">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Updating…" : "Update"}
        </Button>
        {state.ok && <Note tone="pos">● Updated</Note>}
        {state.error && <Note tone="warn">{state.error}</Note>}
        <span className="font-mono text-[10.5px] text-ink-4">Stored only as a salted scrypt hash.</span>
      </div>
    </form>
  );
}
