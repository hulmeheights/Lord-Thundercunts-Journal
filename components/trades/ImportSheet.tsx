"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsv } from "@/lib/import/csv";
import { autoMap, detectShape, MAPPABLE_FIELDS, mapRows, SHAPE_LABEL, type Field as MapField, type Mapping } from "@/lib/import/formats";
import type { DateOrder } from "@/lib/import/values";
import { deleteImport, importChunk } from "@/lib/actions/import";
import { feeResolver } from "@/lib/import/fees";
import { fmtMoney, fmtPrice } from "@/lib/format";
import { timeInTz, dayKey } from "@/lib/analytics/time";
import { cn } from "@/lib/cn";
import { Btn, Dot, Field } from "@/components/m";
import { Seg } from "@/components/m/Seg";

const CHUNK = 400;
const PREVIEW = 6;

const WHERE: [string, string][] = [
  ["Tradovate · Lucid · Tradeify", "Account → Reports → Performance → Download CSV."],
  ["TopstepX · ProjectX", "Trades panel → Export."],
  ["NinjaTrader", "Trade Performance → Trades grid → right-click → Export."],
];

/** Eyebrow caption for a group of controls. */
function Caption({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4 font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">
      <span>{children}</span>
      {aside && <span className="text-right">{aside}</span>}
    </div>
  );
}

/**
 * The free path for any platform: drop the trade export (CSV) from Tradovate,
 * TopstepX, Lucid, Tradeify, NinjaTrader… and it lands in the journal.
 * Format detection, a preview, optional fees and unknown point values, then a
 * chunked import that never duplicates.
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
  const [result, setResult] = useState<{ added: number; duplicates: number; importId: string } | null>(null);
  const [undo, setUndo] = useState<"idle" | "confirm" | "working" | "done">("idle");
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
  const count = preview?.items.length ?? 0;

  const run = async () => {
    if (!preview?.items.length) return;
    const label = account.trim() || fileAccounts[0] || "Imported account";
    setBusy(true);
    setError(null);
    let added = 0,
      duplicates = 0;
    // One id for every chunk, so this whole file can be undone later.
    const importId = `imp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const pv: Record<string, number> = {};
    for (const [k, v] of Object.entries(pointValues)) if (Number(v) > 0) pv[k] = Number(v);
    try {
      for (let i = 0; i < preview.items.length; i += CHUNK) {
        setProgress(`Importing ${Math.min(i + CHUNK, preview.items.length)} of ${preview.items.length}`);
        const res = await importChunk({ importId, fileName, accountLabel: label, pointValues: pv, items: preview.items.slice(i, i + CHUNK) });
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
      setResult({ added, duplicates, importId });
      router.refresh();
    } catch {
      setError("Import failed — try again.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  /* ── done ─────────────────────────────────────────────────────────── */
  if (result) {
    return (
      <div className="pt-2">
        <div className="flex items-center gap-3 font-mono text-[9.5px] tracking-[0.3em] uppercase">
          <Dot tone="pos" />
          <span className="text-pos">Imported</span>
        </div>
        <p className="mt-7 max-w-[20ch] font-serif text-[clamp(1.7rem,3.6vw,2.5rem)] leading-[1.18] font-light tracking-[-0.01em] [&_em]:italic">
          {result.added === 0 ? (
            <>
              Nothing new. The tape already <em>had</em> it.
            </>
          ) : (
            <>
              <em>{result.added.toLocaleString("en-US")}</em> new row{result.added === 1 ? "" : "s"} on the tape.
            </>
          )}
        </p>
        <p className="mt-5 max-w-[44ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-3">
          {result.duplicates
            ? `${result.duplicates.toLocaleString("en-US")} already in your journal — skipped, never doubled.`
            : "Every fill paired, every fee counted. Nothing was doubled."}
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Btn className="w-full sm:w-auto" variant="primary" size="lg" onClick={onDone}>
            Done
          </Btn>
          {result.added > 0 && undo === "idle" && (
            <button type="button" onClick={() => setUndo("confirm")} className="font-mono text-[9.5px] tracking-[0.28em] text-ink-4 uppercase hover:text-ink">
              Undo this import
            </button>
          )}
          {undo === "confirm" && (
            <span className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] text-ink-3">
              Remove the {result.added} new rows?
              <button
                type="button"
                onClick={async () => {
                  setUndo("working");
                  await deleteImport(result.importId);
                  setUndo("done");
                  router.refresh();
                }}
                className="text-[9.5px] tracking-[0.28em] text-neg uppercase hover:text-ink"
              >
                Yes, undo it
              </button>
              <button type="button" onClick={() => setUndo("idle")} className="text-[9.5px] tracking-[0.28em] text-ink-4 uppercase hover:text-ink">
                Keep
              </button>
            </span>
          )}
          {undo === "working" && <span className="font-mono text-[11px] text-ink-3">Undoing…</span>}
          {undo === "done" && <span className="font-mono text-[11px] text-ink-3">Undone. The tape is as it was before this file.</span>}
        </div>
      </div>
    );
  }

  /* ── choose a file ────────────────────────────────────────────────── */
  if (!rows) {
    return (
      <div>
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
            "group relative block w-full rounded-[2px] border px-[clamp(1.4rem,4vw,2.4rem)] py-[clamp(2.4rem,7vh,3.6rem)] text-left transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            drag ? "border-gold" : "border-line-2 hover:border-ink-4",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "absolute top-[clamp(1.4rem,3vh,2rem)] right-[clamp(1.4rem,4vw,2.4rem)] font-mono text-[14px] transition-[color,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
              drag ? "translate-y-1 text-gold" : "text-ink-4 group-hover:translate-y-1 group-hover:text-ink-2",
            )}
          >
            ↓
          </span>
          <span className="block font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">{drag ? "Let go" : "CSV · up to 15 MB"}</span>
          <span className="mt-5 block max-w-[16ch] font-serif text-[clamp(1.7rem,3.6vw,2.4rem)] leading-[1.15] font-light tracking-[-0.01em]">
            Drop the export <em className="italic">here</em>.
          </span>
          <span className="mt-4 block max-w-[42ch] font-mono text-[11.5px] leading-[1.85] tracking-[0.03em] text-ink-3">
            Or choose a file. Round trips or raw fills — the layout is read for you, and re-importing never duplicates.
          </span>
          <span className="m-link mt-8 inline-block pb-1 font-mono text-[9.5px] tracking-[0.28em] text-ink-2 uppercase">Choose a file →</span>
        </button>
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />

        {error && (
          <p role="alert" className="mt-6 border-l-2 border-gold pl-4 font-mono text-[12px] leading-[1.8] text-ink-2">
            {error}
          </p>
        )}

        <div className="mt-[clamp(2.4rem,6vh,3.2rem)]">
          <Caption>Where to find it</Caption>
          <ol className="border-b border-line">
            {WHERE.map(([who, how], i) => (
              <li key={who} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-t border-line py-4 sm:grid-cols-[2rem_13rem_minmax(0,1fr)] sm:gap-x-5">
                <span className="font-mono text-[10.5px] tracking-[0.1em] text-gold">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-mono text-[11.5px] tracking-[0.04em] text-ink">{who}</span>
                <span className="col-start-2 mt-1 font-mono text-[11.5px] leading-[1.75] text-ink-3 sm:col-start-3 sm:mt-0">{how}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  /* ── read, check, import ──────────────────────────────────────────── */
  return (
    <div className="space-y-[clamp(2rem,5vh,2.6rem)]">
      {/* the file */}
      <div className="flex items-start justify-between gap-5 border-y border-line py-5">
        <div className="min-w-0">
          <div className="truncate font-mono text-[13px] tracking-[0.02em] text-ink">{fileName}</div>
          <div className="mt-2 flex items-baseline gap-2.5 font-mono text-[11px] leading-[1.7] text-ink-3">
            <Dot tone={shape === "unknown" ? "gold" : "pos"} pulse={false} className="relative -top-px shrink-0" />
            <span>
              {shape === "unknown" ? "Unrecognised layout — map the columns below" : SHAPE_LABEL[shape]}
              <span className="text-ink-4">
                {" · "}
                {count} row{count === 1 ? "" : "s"} ready{preview?.skipped ? ` · ${preview.skipped} skipped` : ""}
              </span>
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setRows(null);
            setMapping(null);
            setError(null);
            setUnknownRoots([]);
          }}
          className="m-link shrink-0 pb-1 font-mono text-[9.5px] tracking-[0.26em] text-ink-3 uppercase"
        >
          Change file
        </button>
      </div>

      {/* the settings */}
      <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
        <Field
          label="Which account is this?"
          hint={fileAccounts.length > 1 ? `The file names ${fileAccounts.length} accounts — each is kept separate.` : "Lands under this name in Guardian and the log."}
        >
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
        </Field>
        <div>
          <span className="mb-2 block font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">Dates in the file</span>
          <Seg
            className="sm:min-h-[46px]"
            value={dateOrder}
            onChange={setDateOrder}
            options={[
              { value: "MDY", label: "MM/DD · US" },
              { value: "DMY", label: "DD/MM · UK" },
            ]}
          />
        </div>
      </div>

      {!hasFees && (
        <div>
          <Caption>No fees in this file — add commissions?</Caption>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <Seg
              value={feeMode}
              onChange={setFeeMode}
              options={[
                { value: "none", label: "None" },
                { value: "lucid", label: "Lucid rates" },
                { value: "flat", label: "$ / contract" },
              ]}
            />
            {feeMode === "flat" && (
              <label className="flex w-48 items-baseline gap-2 border-b border-line-2 transition-colors duration-300 focus-within:border-ink-3">
                <span className="font-mono text-[12px] text-ink-4">$</span>
                <input
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="1.24 round turn"
                  aria-label="Fee per contract, round turn"
                  className="num w-full bg-transparent py-2 text-[13px] text-ink outline-none placeholder:text-ink-4"
                />
              </label>
            )}
          </div>
        </div>
      )}

      {(shape === "unknown" || (preview?.errors.length ?? 0) > 0) && mapping && rows && (
        <details open={shape === "unknown"} className="group border-y border-line py-5">
          <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 font-mono text-[9.5px] tracking-[0.24em] text-ink-2 uppercase [&::-webkit-details-marker]:hidden">
            <span>Column mapping</span>
            <span aria-hidden className="text-ink-4 transition-transform duration-300 group-open:rotate-180">
              ↓
            </span>
          </summary>
          <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {MAPPABLE_FIELDS.filter((f) => shape === "unknown" || f.shapes.includes(shape)).map((f) => (
              <label key={f.field} className="flex items-center justify-between gap-3">
                <span className="font-mono text-[11px] text-ink-3">{f.label}</span>
                <select
                  className="field h-9 w-44 py-0 text-[12px]"
                  value={mapping[f.field] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [f.field as MapField]: e.target.value === "" ? undefined : Number(e.target.value) })}
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

      {preview && count > 0 && (
        <div>
          <Caption aside={count > PREVIEW ? `First ${PREVIEW} of ${count}` : `${count} row${count === 1 ? "" : "s"}`}>Preview</Caption>
          <div className="border-b border-line">
            {preview.items.slice(0, PREVIEW).map((it) => {
              const when = it.kind === "trade" ? it.entryTime : it.time;
              const gross = it.kind === "trade" ? it.grossPnl : null;
              return (
                <div
                  key={it.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 gap-y-1 border-t border-line py-3.5 sm:grid-cols-[6.6rem_4.6rem_5.6rem_minmax(0,1fr)_6rem]"
                >
                  <span className="num text-[11px] text-ink-4 max-sm:hidden">
                    {dayKey(when, tz).slice(5).replace("-", "/")} {timeInTz(when, tz)}
                  </span>
                  <span className="flex min-w-0 items-baseline gap-3 sm:contents">
                    <span className="truncate font-mono text-[13px] tracking-[0.06em] text-ink">{it.symbol}</span>
                    <span className="font-mono text-[9.5px] tracking-[0.2em] whitespace-nowrap text-ink-3 uppercase">
                      {it.kind === "trade" ? it.direction : it.side} ×{it.qty}
                    </span>
                  </span>
                  <span className="num row-span-2 self-center text-right text-[13px] sm:row-span-1 sm:self-auto">
                    {gross !== null ? (
                      <span className={gross > 0 ? "text-pos" : gross < 0 ? "text-neg" : "text-ink-3"}>{fmtMoney(gross, { sign: true })}</span>
                    ) : (
                      <span className="text-ink-4">fill</span>
                    )}
                  </span>
                  <span className="num truncate text-[11.5px] text-ink-3 sm:col-start-4 sm:row-start-1">
                    <span className="text-ink-4 sm:hidden">{timeInTz(when, tz)} · </span>
                    {it.kind === "trade" ? (
                      <>
                        {fmtPrice(it.entryPrice)} <span className="text-ink-4">→</span> {fmtPrice(it.exitPrice)}
                      </>
                    ) : (
                      fmtPrice(it.price)
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {unknownRoots.length > 0 && (
        <div>
          <Caption>Dollar value of one point</Caption>
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {unknownRoots.map((r) => (
              <Field key={r} label={`${r} · $ per point`}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={pointValues[r] ?? ""}
                  onChange={(e) => setPointValues({ ...pointValues, [r]: e.target.value })}
                  placeholder="e.g. 2"
                  className="field num"
                />
              </Field>
            ))}
          </div>
        </div>
      )}

      {(error || preview?.errors[0]) && (
        <p role="alert" className="border-l-2 border-gold pl-4 font-mono text-[12px] leading-[1.8] text-ink-2">
          {error ?? preview?.errors[0]}
        </p>
      )}

      <Btn variant="primary" size="lg" className="w-full" disabled={busy || !count} onClick={run}>
        {busy ? (
          <>
            <Dot tone="gold" />
            {progress ?? "Importing"}
          </>
        ) : (
          `Import ${count.toLocaleString("en-US")} row${count === 1 ? "" : "s"}`
        )}
      </Btn>
    </div>
  );
}
