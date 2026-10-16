"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dot } from "@/components/m";
import { timeAgo } from "@/lib/format";

/** Meridian's HUD status line — "● LIVE · 2M AGO". Quietly auto-syncs on open; tap to sync now. */
export function SyncPill({ lastSyncAt, hasConnections, error }: { lastSyncAt: string | null; hasConnections: boolean; error: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ran = useRef(false);
  // Relative time depends on the clock, so it's only written once mounted (no SSR mismatch).
  const [ago, setAgo] = useState("");
  useEffect(() => {
    const tick = () => setAgo(timeAgo(lastSyncAt));
    tick();
    const iv = setInterval(tick, 30_000);
    return () => clearInterval(iv);
  }, [lastSyncAt]);

  const sync = useCallback(
    async (auto: boolean) => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ auto }),
        });
        const json = (await res.json()) as { results?: { ok: boolean; error?: string; newFills?: number }[] };
        const failed = json.results?.find((r) => !r.ok);
        if (failed) setMsg(failed.error ?? "Sync failed");
        router.refresh();
      } catch {
        setMsg("Offline");
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (ran.current || !hasConnections) return;
    ran.current = true;
    if (!lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > 10 * 60_000) void sync(true);
  }, [hasConnections, lastSyncAt, sync]);

  if (!hasConnections) return null;
  const problem = msg ?? error;
  return (
    <button
      type="button"
      onClick={() => sync(false)}
      disabled={busy}
      title={problem ?? "Sync trades now"}
      className="group inline-flex shrink-0 items-center gap-2.5 font-mono text-[10px] tracking-[0.24em] whitespace-nowrap text-ink-4 uppercase transition-colors duration-300 hover:text-ink"
    >
      {busy ? (
        <>
          <Dot tone="mute" />
          Syncing…
        </>
      ) : problem ? (
        <>
          <span className="text-gold">◆</span>
          <span className="text-ink-3 group-hover:text-ink">Sync issue · retry</span>
        </>
      ) : (
        <>
          <Dot />
          <span className="text-pos">Live</span>
          <span suppressHydrationWarning>· {ago}</span>
        </>
      )}
    </button>
  );
}
