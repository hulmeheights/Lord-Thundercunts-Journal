"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearSampleData, deleteAllTradingData, loadSampleData } from "@/lib/actions/settings";
import { Button, buttonClass } from "@/components/ui/Button";
import { lineInput, Note, SRow } from "./ui";

export function DataControls({ sampleCount }: { sampleCount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmText, setConfirmText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="max-w-3xl">
      <SRow name="Sample data" hint={sampleCount ? `${sampleCount} sample trades loaded. Clear them before your own history arrives.` : "See every page alive with realistic demo trades."}>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await (sampleCount ? clearSampleData() : loadSampleData());
              router.refresh();
            })
          }
        >
          {pending ? "Working…" : sampleCount ? "Clear samples" : "Load samples"}
        </Button>
      </SRow>
      <SRow name="Export everything" hint="Trades, journal, ledger and settings as JSON. Never includes credentials.">
        <a href="/api/export" className={buttonClass("secondary", "sm")}>
          ↓ Export
        </a>
      </SRow>
      <SRow name="Delete all trades" hint="Removes every trade and fill. The journal stays, and connected accounts re-import on the next full sync." stack>
        <div className="flex flex-wrap items-end gap-4">
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Type DELETE" aria-label="Type DELETE to confirm" className={`${lineInput} w-44`} />
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
            Delete
          </Button>
          {msg && <Note>{msg}</Note>}
        </div>
      </SRow>
    </div>
  );
}
