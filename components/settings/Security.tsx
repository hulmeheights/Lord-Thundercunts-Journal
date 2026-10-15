"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, LoaderCircle, LogOut, Monitor, Plus, ScanFace, Trash2 } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { removePasskey, setPasskeyOnly, signOutEverywhere } from "@/lib/actions/auth";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";

type Passkey = { id: string; name: string; createdAt: string; lastUsedAt: string | null };
type SessionInfo = { id: string; current: boolean; createdAt: string; lastSeenAt: string; device: string; method: string };

function guessDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Mac/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows PC";
  return "Passkey";
}

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
      const opt = await fetch("/api/auth/passkey/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "options" }),
      }).then((r) => r.json());
      if (!opt.options) throw new Error(opt.error ?? "Couldn't start passkey setup");
      const response = await startRegistration({ optionsJSON: opt.options });
      const res = await fetch("/api/auth/passkey/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "verify", challengeId: opt.challengeId, response, name: guessDeviceName() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save passkey");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Passkey setup failed";
      setError(/NotAllowed|abort|cancel/i.test(msg) ? "Cancelled." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold">Face ID / Touch ID passkeys</div>
            <div className="text-[12.5px] text-ink-3">Phishing-proof sign-in. The private key never leaves your device.</div>
          </div>
          <Button size="sm" variant="primary" onClick={addPasskey} disabled={busy}>
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />} Add passkey
          </Button>
        </div>
        {error && <div className="mb-2 text-[13px] text-orange">{error}</div>}
        <div className="divide-y divide-line rounded-2xl border border-line">
          {passkeys.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-3.5 text-[13.5px] text-ink-3">
              <ScanFace size={18} /> No passkeys yet — add one to unlock with Face ID.
            </div>
          ) : (
            passkeys.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Fingerprint size={18} className="text-cyan" />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{p.name}</div>
                  <div className="text-[12px] text-ink-3">Added {timeAgo(p.createdAt)} · last used {timeAgo(p.lastUsedAt)}</div>
                </div>
                <button
                  onClick={() =>
                    start(async () => {
                      if (!confirm("Remove this passkey?")) return;
                      await removePasskey(p.id);
                      router.refresh();
                    })
                  }
                  className="text-ink-4 hover:text-neg"
                  aria-label="Remove passkey"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-line bg-fill px-4 py-3">
          <div>
            <div className="text-[14px] font-semibold">Passkey-only mode</div>
            <div className="text-[12px] text-ink-3">Disables passphrase unlock entirely. Maximum security.</div>
          </div>
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
            label="Passkey-only"
          />
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold">Signed-in devices</div>
            <div className="text-[12.5px] text-ink-3">Sessions expire after 30 days of inactivity.</div>
          </div>
          <form action={signOutEverywhere}>
            <Button size="sm" variant="danger" type="submit">
              <LogOut size={14} /> Sign out everywhere
            </Button>
          </form>
        </div>
        <div className="divide-y divide-line rounded-2xl border border-line">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <Monitor size={17} className="text-ink-3" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium">
                  {s.device} {s.current && <span className="ml-1 rounded-full bg-pos/15 px-2 py-0.5 text-[11px] font-semibold text-pos">This device</span>}
                </div>
                <div className="text-[12px] text-ink-3">
                  via {s.method} · active {timeAgo(s.lastSeenAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
