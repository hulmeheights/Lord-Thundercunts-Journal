"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, LoaderCircle, Sparkles, Trash2 } from "lucide-react";
import { clearSampleData, deleteAllTradingData, loadSampleData } from "@/lib/actions/settings";
import { Button } from "@/components/ui/Button";

export function DataControls({ sampleCount }: { sampleCount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmText, setConfirmText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-line bg-fill px-4 py-3">
        <div>
          <div className="text-[14px] font-semibold">Sample data</div>
          <div className="text-[12.5px] text-ink-3">{sampleCount ? `${sampleCount} sample trades loaded.` : "Explore every feature with realistic demo trades."}</div>
        </div>
        {sampleCount ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { await clearSampleData(); router.refresh(); })}>
            {pending && <LoaderCircle size={14} className="animate-spin" />} Clear sample data
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { await loadSampleData(); router.refresh(); })}>
            {pending ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />} Load sample data
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-line bg-fill px-4 py-3">
        <div>
          <div className="text-[14px] font-semibold">Export everything</div>
          <div className="text-[12.5px] text-ink-3">Trades, journal, settings — as JSON. Never includes credentials.</div>
        </div>
        <a href="/api/export" className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-fill-2 px-3.5 text-[13px] font-semibold hover:bg-fill-3">
          <Download size={14} /> Export
        </a>
      </div>
      <div className="rounded-[3px] border border-neg/25 bg-neg/[0.05] px-4 py-3">
        <div className="text-[14px] font-semibold text-neg">Delete all trades</div>
        <div className="mb-3 text-[12.5px] text-ink-3">Removes every trade and fill (your journal stays). Brokers will re-import on the next full sync.</div>
        <div className="flex flex-wrap gap-2">
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Type DELETE" className="field h-9 w-40 text-[13px]" />
          <Button
            size="sm"
            variant="danger"
            disabled={confirmText !== "DELETE" || pending}
            onClick={() =>
              start(async () => {
                const r = await deleteAllTradingData(confirmText);
                setMsg(r.error ?? "All trades deleted.");
                setConfirmText("");
                router.refresh();
              })
            }
          >
            <Trash2 size={14} /> Delete
          </Button>
        </div>
        {msg && <div className="mt-2 text-[12.5px] text-ink-3">{msg}</div>}
      </div>
    </div>
  );
}
