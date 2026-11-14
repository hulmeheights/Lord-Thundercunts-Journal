"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setNewsMinutes } from "@/lib/actions/bot";

/** Minutes either side of high-impact news with no new entries (0 = off). */
export function NewsMinutes({ initial, action = setNewsMinutes }: { initial: number; action?: (minutes: number) => Promise<{ ok?: boolean; error?: string } | { error: string }> }) {
  const router = useRouter();
  const [v, setV] = useState(String(initial));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await action(Math.round(Number(v) || 0));
      setMsg("error" in r && r.error ? r.error : "Saved");
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-3 font-mono text-[11.5px] text-ink-2">
      No new trades
      <input className="field num h-9 w-16 px-2 py-0 text-center" inputMode="numeric" value={v} aria-label="Minutes either side of news" onChange={(e) => setV(e.target.value.replace(/\D/g, ""))} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />
      minutes before and after high-impact US news.
      {pending ? <span className="text-ink-4">Saving…</span> : msg && <span className={msg === "Saved" ? "text-pos" : "text-neg"}>{msg}</span>}
    </div>
  );
}
