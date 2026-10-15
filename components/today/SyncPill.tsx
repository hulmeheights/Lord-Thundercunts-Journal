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
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-line-2 px-3.5 text-[12.5px] transition-colors",
        problem ? "text-warn" : "text-ink-2 hover:text-ink",
      )}
      title={problem ?? "Sync trades now"}
    >
      {problem && !busy ? (
        <TriangleAlert size={14} />
      ) : busy ? (
        <RefreshCw size={13} className="animate-spin" />
      ) : (
        <span className="relative grid h-2 w-2 place-items-center">
          <span className="absolute h-2 w-2 animate-ping rounded-full bg-glow opacity-60" />
          <span className="h-1.5 w-1.5 rounded-full bg-glow" />
        </span>
      )}
      {busy ? "Syncing…" : problem ? "Sync issue — retry" : `Live · ${timeAgo(lastSyncAt)}`}
    </button>
  );
}
