"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";

/** Shows sync status and quietly auto-syncs when the app is opened. */
export function SyncPill({ lastSyncAt, hasConnections, error }: { lastSyncAt: string | null; hasConnections: boolean; error: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ran = useRef(false);

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
      onClick={() => sync(false)}
      disabled={busy}
      className={cn(
        "glass inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[12.5px] font-medium transition-colors",
        problem ? "text-orange" : "text-ink-2 hover:text-ink",
      )}
      title={problem ?? "Sync trades now"}
    >
      {problem && !busy ? <TriangleAlert size={14} /> : <RefreshCw size={14} className={busy ? "animate-spin" : ""} />}
      {busy ? "Syncing…" : problem ? "Sync issue — retry" : `Synced ${timeAgo(lastSyncAt)}`}
    </button>
  );
}
