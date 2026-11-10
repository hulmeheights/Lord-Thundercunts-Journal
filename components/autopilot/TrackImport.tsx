"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsv } from "@/lib/import/csv";
import { parseTradingView } from "@/lib/bot/history";
import { mapRows } from "@/lib/import/formats";
import { guessDateOrder } from "@/lib/import/values";
import { importChunk } from "@/lib/actions/import";
import { deleteHistoryImport, importHistory } from "@/lib/actions/bot";
import { Btn } from "@/components/m";
import type { HistImportView } from "@/lib/data/history";

const CHUNK = 800;
/** Drop a TradingView List of trades export in; trades already kept are skipped, so nothing doubles. */
export function TrackImport({ tz, imports }: { tz: string; imports: HistImportView[] }) {
  const source = "tv" as const;
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = async (f: File) => {
    setMsg(null);
    if (f.size > 10 * 1024 * 1024) return setMsg({ ok: false, text: "That file is over 10 MB." });
    const rows = parseCsv(await f.text());
    const r = parseTradingView(rows, [tz]);
    if (r.error) return importBroker(rows, f.name);
    if (!r.trades.length) return setMsg({ ok: false, text: "No finished trades in that file." });
    setBusy(true);
    const importId = `bh_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    let added = 0;
    let repeats = 0;
    for (let i = 0; i < r.trades.length; i += CHUNK) {
      const res = await importHistory({ importId, source, fileName: f.name, account: null, trades: r.trades.slice(i, i + CHUNK) });
      if ("error" in res) {
        setBusy(false);
        return setMsg({ ok: false, text: res.error });
      }
      added += res.added;
      repeats += res.repeats;
    }
    setBusy(false);
    const extra = [repeats ? `${repeats} already here` : "", r.open ? `${r.open} still open, left out` : "", r.tz && r.tz !== tz ? `chart times read as ${r.tz}` : ""].filter(Boolean).join(" · ");
    setMsg({ ok: true, text: `${added} new ${added === 1 ? "trade" : "trades"} added${extra ? ` · ${extra}` : ""}.` });
    if (file.current) file.current.value = "";
    router.refresh();
  };

  /**
   * Not a TradingView export: a broker or prop-firm export (TopstepX, ProjectX, Tradovate, Lucid, …).
   * Those are your own trades, so they go into the journal's Trades, never the strategy's record.
   */
  const importBroker = async (rows: string[][], fileName: string) => {
    const parsed = mapRows(rows, { tz, dateOrder: guessDateOrder(rows) ?? "MDY" });
    if (parsed.shape === "unknown" || !parsed.items.length) {
      return setMsg({ ok: false, text: "This isn't a TradingView export, and its columns didn't match a broker export either. Import it under Trades → Import, where you can map the columns yourself." });
    }
    setBusy(true);
    const importId = `imp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    let added = 0;
    let duplicates = 0;
    for (let i = 0; i < parsed.items.length; i += 400) {
      const res = await importChunk({ importId, fileName, accountLabel: "Imported account", pointValues: {}, items: parsed.items.slice(i, i + 400) });
      if (res.unknownRoots?.length || res.error) {
        setBusy(false);
        return setMsg({ ok: false, text: res.error ?? `Import it under Trades → Import (it needs the $ value of a point for ${res.unknownRoots!.join(", ")}).` });
      }
      added += res.added ?? 0;
      duplicates += res.duplicates ?? 0;
    }
    setBusy(false);
    setMsg({ ok: true, text: `That's a broker export, not TradingView: ${added} ${added === 1 ? "trade" : "trades"} added to your journal (Trades)${duplicates ? `, ${duplicates} already there` : ""}. They're your own trades, so they don't change the strategy's track record.` });
    if (file.current) file.current.value = "";
    router.refresh();
  };

  const remove = async (id: string) => {
    setConfirm(null);
    const r = await deleteHistoryImport(id);
    setMsg("error" in r ? { ok: false, text: r.error } : { ok: true, text: `Import removed (${r.removed} trades).` });
    router.refresh();
  };
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="font-mono text-[11px]">
      <p className="max-w-2xl leading-[1.8] text-ink-4">TradingView → your strategy → Strategy Tester → List of trades → Export (the download arrow). Import a fresh export every week or so: trades already here are skipped, so overlapping exports never double anything. A broker or prop-firm export (TopstepX, Tradovate, Lucid…) dropped here goes into your journal&apos;s Trades instead.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        <Btn onClick={() => file.current?.click()} disabled={busy}>
          {busy ? "Importing…" : "Import TradingView CSV"}
        </Btn>
        {msg && <span className={msg.ok ? "text-pos" : "text-neg"}>{msg.text}</span>}
      </div>
      {imports.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-[10px] tracking-[0.2em] text-ink-4 uppercase">Imports ({imports.length})</summary>
          <ul className="mt-2">
            {imports.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2 text-[10.5px]">
                <span className="text-ink-3">
                  {when(i.at)} · {i.fileName ?? "file"}
                  {i.account && ` · ${i.account}`} · {i.added} new of {i.rows}
                </span>
                {confirm === i.id ? (
                  <span className="flex gap-3">
                    <button className="text-neg" onClick={() => remove(i.id)}>
                      Remove its {i.added} trades
                    </button>
                    <button className="text-ink-4" onClick={() => setConfirm(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button className="text-ink-4 hover:text-neg" onClick={() => setConfirm(i.id)}>
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
