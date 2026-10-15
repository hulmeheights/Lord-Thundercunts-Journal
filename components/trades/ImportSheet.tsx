"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, FileUp, LoaderCircle, TriangleAlert } from "lucide-react";
import { parseCsv } from "@/lib/import/csv";
import { autoMap, detectShape, MAPPABLE_FIELDS, mapRows, SHAPE_LABEL, type Field, type Mapping } from "@/lib/import/formats";
import type { DateOrder } from "@/lib/import/values";
import { importChunk } from "@/lib/actions/import";
import { feeResolver } from "@/lib/import/fees";
import { fmtMoney, fmtPrice } from "@/lib/format";
import { timeInTz, dayKey } from "@/lib/analytics/time";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";

const CHUNK = 400;

/**
 * The free path for any platform: drop the trade export (CSV) from Tradovate,
 * TopstepX, Lucid, Tradeify, NinjaTrader… and it lands in the journal.
 */
export function ImportSheet({ tz, accounts, onDone }: { tz: string; accounts: string[]; onDone: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [dateOrder, setDateOrder] = useState<DateOrder>("MDY");
  const [fee, setFee] = useState("");
  const [feeMode, setFeeMode] = useState<"none" | "lucid" | "flat">("none");
  const [account, setAccount] = useState("");
  const [pointValues, setPointValues] = useState<Record<string, string>>({});
  const [unknownRoots, setUnknownRoots] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; duplicates: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const load = async (file: File) => {
    setError(null);
    setResult(null);
    setUnknownRoots([]);
    if (file.size > 15 * 1024 * 1024) {
      setError("That file is over 15 MB — export a shorter date range.");
      return;
    }
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      setError("No rows found in that file.");
      return;
    }
    setFileName(file.name);
    setRows(parsed);
    setMapping(autoMap(parsed[0]!));
  };

  const preview = useMemo(() => {
    if (!rows || !mapping) return null;
    return mapRows(rows, { tz, dateOrder, mapping, feePerContract: feeResolver(feeMode, Number(fee) || 0) });
  }, [rows, mapping, tz, dateOrder, fee, feeMode]);

  const fileAccounts = useMemo(() => [...new Set((preview?.items ?? []).map((i) => i.account).filter(Boolean) as string[])], [preview]);
  const shape = mapping ? detectShape(mapping) : "unknown";
  const hasFees = mapping?.fees !== undefined || mapping?.commissions !== undefined;

  const run = async () => {
    if (!preview?.items.length) return;
    const label = account.trim() || fileAccounts[0] || "Imported account";
    setBusy(true);
    setError(null);
    let added = 0, duplicates = 0;
    const pv: Record<string, number> = {};
    for (const [k, v] of Object.entries(pointValues)) if (Number(v) > 0) pv[k] = Number(v);
    try {
      for (let i = 0; i < preview.items.length; i += CHUNK) {
        setProgress(`Importing ${Math.min(i + CHUNK, preview.items.length)} of ${preview.items.length}…`);
        const res = await importChunk({ accountLabel: label, pointValues: pv, items: preview.items.slice(i, i + CHUNK) });
        if (res.unknownRoots?.length) {
          setUnknownRoots(res.unknownRoots);
          setError(`Tell me the $ value of one point for: ${res.unknownRoots.join(", ")}.`);
          return;
        }
        if (res.error) {
          setError(res.error);
          return;
        }
        added += res.added ?? 0;
        duplicates += res.duplicates ?? 0;
      }
      setResult({ added, duplicates });
      router.refresh();
    } catch {
      setError("Import failed — try again.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  if (result) {
    return (
      <div className="py-6 text-center">
        <CircleCheck size={44} className="mx-auto text-pos" />
        <div className="mt-3 text-[18px] font-semibold">Imported</div>
        <p className="mt-1 text-[14px] text-ink-3">
          {result.added} new row{result.added === 1 ? "" : "s"} added
          {result.duplicates ? ` · ${result.duplicates} already in your journal (skipped)` : ""}.
        </p>
        <Button className="mt-5" variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!rows ? (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) void load(f);
            }}
            className={cn(
              "flex w-full flex-col items-center gap-3 rounded-[24px] border-2 border-dashed px-6 py-10 text-center transition-colors",
              drag ? "border-cyan bg-cyan/5" : "border-line-2 bg-fill hover:bg-fill-2",
            )}
          >
            <FileUp size={30} className="text-cyan" />
            <div className="text-[15px] font-semibold">Drop your trade export here</div>
            <div className="text-[13px] text-ink-3">CSV from Tradovate, TopstepX, Lucid, Tradeify, NinjaTrader and more. Re-importing never duplicates.</div>
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          <div className="space-y-1.5 text-[12.5px] leading-relaxed text-ink-3">
            <div>
              <b className="text-ink-2">Tradovate (Lucid / Tradeify):</b> Account → Reports → Performance → Download CSV.
            </div>
            <div>
              <b className="text-ink-2">TopstepX / ProjectX:</b> Trades panel → Export.
            </div>
            <div>
              <b className="text-ink-2">NinjaTrader:</b> Trade Performance → Trades grid → right-click → Export.
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-fill px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">{fileName}</div>
              <div className={cn("text-[12.5px]", shape === "unknown" ? "text-orange" : "text-pos")}>
                {SHAPE_LABEL[shape]} · {preview?.items.length ?? 0} rows ready{preview?.skipped ? ` · ${preview.skipped} skipped` : ""}
              </div>
            </div>
            <button
              onClick={() => {
                setRows(null);
                setMapping(null);
              }}
              className="text-[12.5px] font-semibold text-ink-3 hover:text-ink"
            >
              Change file
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-[12.5px] text-ink-3">Which account is this?</span>
              <input
                list="ltj-accounts"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder={fileAccounts[0] ?? "e.g. Lucid 50K Eval"}
                className="field"
                maxLength={80}
              />
              <datalist id="ltj-accounts">
                {accounts.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
              {fileAccounts.length > 1 && <span className="text-[11.5px] text-ink-4">The file names {fileAccounts.length} accounts — each is kept separate.</span>}
            </label>
            <div className="space-y-1.5">
              <span className="block text-[12.5px] text-ink-3">Date format in the file</span>
              <Segmented size="sm" value={dateOrder} onChange={setDateOrder} options={[{ value: "MDY", label: "MM/DD (US)" }, { value: "DMY", label: "DD/MM (UK)" }]} />
              {!hasFees && (
                <div className="mt-2 space-y-1.5">
                  <span className="block text-[12.5px] text-ink-3">This file has no fees — add commissions?</span>
                  <Segmented size="sm" value={feeMode} onChange={setFeeMode} options={[{ value: "none", label: "None" }, { value: "lucid", label: "Lucid rates" }, { value: "flat", label: "$ / contract" }]} />
                  {feeMode === "flat" && (
                    <input value={fee} onChange={(e) => setFee(e.target.value)} type="number" min="0" step="0.01" placeholder="Round turn, e.g. 1.24" className="field h-10" />
                  )}
                </div>
              )}
            </div>
          </div>

          {(shape === "unknown" || (preview?.errors.length ?? 0) > 0) && mapping && rows && (
            <details open={shape === "unknown"} className="rounded-2xl border border-line bg-fill p-4">
              <summary className="cursor-pointer text-[13px] font-semibold text-ink-2">Column mapping</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {MAPPABLE_FIELDS.filter((f) => shape === "unknown" || f.shapes.includes(shape)).map((f) => (
                  <label key={f.field} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="text-ink-3">{f.label}</span>
                    <select
                      className="field h-9 w-44 py-0 text-[12.5px]"
                      value={mapping[f.field] ?? ""}
                      onChange={(e) => setMapping({ ...mapping, [f.field as Field]: e.target.value === "" ? undefined : Number(e.target.value) })}
                    >
                      <option value="">—</option>
                      {rows[0]!.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </details>
          )}

          {preview && preview.items.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-line">
              <table className="w-full text-[12.5px]">
                <tbody className="divide-y divide-line">
                  {preview.items.slice(0, 6).map((it) => (
                    <tr key={it.key}>
                      <td className="px-3 py-2 text-ink-3">
                        {it.kind === "trade" ? `${dayKey(it.entryTime, tz).slice(5)} ${timeInTz(it.entryTime, tz)}` : `${dayKey(it.time, tz).slice(5)} ${timeInTz(it.time, tz)}`}
                      </td>
                      <td className="px-2 py-2 font-semibold">{it.symbol}</td>
                      <td className="px-2 py-2 text-ink-2">{it.kind === "trade" ? it.direction : it.side} ×{it.qty}</td>
                      <td className="num px-2 py-2 text-ink-2">{it.kind === "trade" ? `${fmtPrice(it.entryPrice)} → ${fmtPrice(it.exitPrice)}` : fmtPrice(it.price)}</td>
                      <td className={cn("num px-3 py-2 text-right font-semibold", it.kind === "trade" && it.grossPnl !== null ? (it.grossPnl >= 0 ? "text-pos" : "text-neg") : "text-ink-4")}>
                        {it.kind === "trade" && it.grossPnl !== null ? fmtMoney(it.grossPnl, { sign: true }) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {unknownRoots.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {unknownRoots.map((r) => (
                <label key={r} className="flex items-center justify-between gap-2 text-[13px]">
                  <span>
                    <b>{r}</b> $ per point
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={pointValues[r] ?? ""}
                    onChange={(e) => setPointValues({ ...pointValues, [r]: e.target.value })}
                    className="field h-9 w-28"
                  />
                </label>
              ))}
            </div>
          )}

          {(error || preview?.errors[0]) && (
            <div className="flex items-start gap-2 rounded-2xl bg-orange/10 px-3.5 py-2.5 text-[13px] text-orange">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" /> {error ?? preview?.errors[0]}
            </div>
          )}

          <Button variant="primary" size="lg" className="w-full" disabled={busy || !preview?.items.length} onClick={run}>
            {busy && <LoaderCircle size={17} className="animate-spin" />} {progress ?? `Import ${preview?.items.length ?? 0} rows`}
          </Button>
        </>
      )}
    </div>
  );
}
