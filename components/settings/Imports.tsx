"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteImport } from "@/lib/actions/import";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import { Note } from "./ui";

export type ImportRow = { id: string; when: string; range: string; fileName: string | null; accounts: string[]; trades: number; net: number };

/** Every import, newest first; any one can be undone. */
export function Imports({ items }: { items: ImportRow[] }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!items.length) return <p className="py-4 font-mono text-[11px] text-ink-3">No imports yet. Files you import from the Trades page show up here.</p>;
  return (
    <div>
      <ul>
        {items.map((r, i) => (
          <li key={r.id} className="border-b border-line py-3.5 font-mono">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-[11.5px] text-ink">
                {r.when}
                {i === 0 && <span className="ml-2 text-[9px] tracking-[0.24em] text-gold uppercase">Latest</span>}
              </span>
              <span className={cn("num text-[11.5px]", r.net > 0 ? "text-pos" : r.net < 0 ? "text-neg" : "text-ink-3")}>{fmtMoney(r.net, { sign: true })}</span>
            </div>
            <div className="mt-1 text-[10.5px] leading-[1.7] text-ink-4">
              {r.trades} {r.trades === 1 ? "trade" : "trades"} · {r.range}
              {r.accounts.length > 0 && ` · ${r.accounts.join(", ")}`}
              {r.fileName && ` · ${r.fileName}`}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-[9.5px] tracking-[0.26em] uppercase">
              {confirm === r.id ? (
                <>
                  <span className="text-[11px] tracking-normal text-ink-3 normal-case">Delete these {r.trades} trades, with their notes and grades?</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await deleteImport(r.id);
                        setMsg(res.error ?? `Import deleted: ${r.trades} trades removed.`);
                        setConfirm(null);
                        router.refresh();
                      })
                    }
                    className="text-neg hover:text-ink disabled:opacity-40"
                  >
                    {pending ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className="text-ink-4 hover:text-ink">
                    Keep
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirm(r.id)} className="text-ink-4 hover:text-ink">
                  Delete this import
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {msg && <Note className="mt-3">{msg}</Note>}
      <p className="mt-3 font-mono text-[10.5px] leading-[1.8] text-ink-4">
        This only changes your journal. Nothing is sent to your broker or prop firm, and your accounts there aren&apos;t touched. Importing the same file again brings the trades back.
      </p>
    </div>
  );
}
