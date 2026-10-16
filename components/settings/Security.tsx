"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerPasskey } from "@/lib/passkey-client";
import { ChangePassphrase } from "./ChangePassphrase";
import { removePasskey, setPasskeyOnly, signOutEverywhere } from "@/lib/actions/auth";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Dot } from "@/components/m";
import { Note, SRow, Sub } from "./ui";

type Passkey = { id: string; name: string; createdAt: string; lastUsedAt: string | null };
type SessionInfo = { id: string; current: boolean; createdAt: string; lastSeenAt: string; device: string; method: string };

export function Security({ passkeys, sessions, passkeyOnly }: { passkeys: Passkey[]; sessions: SessionInfo[]; passkeyOnly: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [only, setOnly] = useState(passkeyOnly);
  const [, start] = useTransition();

  async function addPasskey() {
    setBusy(true);
    setError(null);
    try {
      await registerPasskey();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Passkey setup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-x-[clamp(3rem,6vw,6rem)] gap-y-14 lg:grid-cols-2">
      <div>
        <Sub
          aside={
            <Button size="sm" variant="primary" onClick={addPasskey} disabled={busy}>
              {busy ? "Waiting…" : "+ Passkey"}
            </Button>
          }
        >
          Face ID · Touch ID
        </Sub>
        {error && <Note tone="warn" className="mt-3">{error}</Note>}
        {passkeys.length === 0 ? (
          <SRow name="No passkeys yet" hint="Add one and unlock with your face. The private key never leaves the device." />
        ) : (
          passkeys.map((p) => (
            <SRow key={p.id} name={p.name} hint={`Added ${timeAgo(p.createdAt)} · last used ${timeAgo(p.lastUsedAt)}`}>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  start(async () => {
                    if (!confirm("Remove this passkey?")) return;
                    await removePasskey(p.id);
                    router.refresh();
                  })
                }
              >
                Remove
              </Button>
            </SRow>
          ))
        )}
        <SRow name="Passkey only" hint={passkeys.length ? "Switch the passphrase off entirely. Maximum security." : "Add a passkey first."}>
          <Toggle
            checked={only}
            disabled={passkeys.length === 0}
            onChange={(v) =>
              start(async () => {
                const res = await setPasskeyOnly(v);
                if (!res.error) setOnly(v);
                else setError(res.error);
              })
            }
            label="Passkey only"
          />
        </SRow>
        <div className="mt-12">
          <ChangePassphrase />
        </div>
      </div>

      <div>
        <Sub
          aside={
            <form action={signOutEverywhere}>
              <Button size="sm" variant="danger" type="submit">
                Sign out everywhere
              </Button>
            </form>
          }
        >
          Signed-in devices
        </Sub>
        {sessions.slice(0, 5).map((s) => (
          <SRow
            key={s.id}
            name={
              <>
                {s.current && <Dot className="mr-2.5" />}
                {s.device}
              </>
            }
            hint={`${s.current ? "This device · " : ""}via ${s.method} · active ${timeAgo(s.lastSeenAt)}`}
          />
        ))}
        {sessions.length > 5 && (
          <SRow name={<span className="text-ink-3">+ {sessions.length - 5} older sessions</span>} hint="Signing out everywhere ends them all, this device included." />
        )}
        <p className="mt-6 max-w-[48ch] font-mono text-[10.5px] leading-[1.8] text-ink-4">
          Sessions expire after 30 days of quiet. Every page and action re-checks the session against the database, so signing out is instant.
        </p>
      </div>
    </div>
  );
}
