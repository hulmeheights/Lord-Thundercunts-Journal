"use client";

import { useActionState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { updatePassphrase, type UnlockState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";

export function ChangePassphrase() {
  const [state, action, pending] = useActionState<UnlockState & { ok?: boolean }, FormData>(updatePassphrase, {});
  return (
    <form action={action} className="rounded-[3px] border border-line bg-fill p-4">
      <div className="mb-3">
        <div className="text-[15px] font-semibold">Change passphrase</div>
        <div className="text-[12.5px] text-ink-3">Stored only as a salted scrypt hash.</div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input name="current" type="password" autoComplete="current-password" placeholder="Current" className="field h-10 text-[14px]" required />
        <input name="next" type="password" autoComplete="new-password" placeholder="New (12+ chars)" minLength={12} className="field h-10 text-[14px]" required />
        <input name="confirm" type="password" autoComplete="new-password" placeholder="New again" minLength={12} className="field h-10 text-[14px]" required />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? <LoaderCircle size={14} className="animate-spin" /> : state.ok ? <Check size={14} className="text-pos" /> : null} {state.ok ? "Updated" : "Update"}
        </Button>
        {state.error && <span className="text-[12.5px] text-neg">{state.error}</span>}
      </div>
    </form>
  );
}
