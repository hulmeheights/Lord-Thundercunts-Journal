"use client";

import { useRef, useState } from "react";
import { checkExpected } from "@/lib/actions/bot";
import { Btn } from "@/components/m";
import { cn } from "@/lib/cn";

type Result = Extract<Awaited<ReturnType<typeof checkExpected>>, { ok: true }>;

/** Drop an expected-trades file in: every card's decisions against it, differences first. Changes nothing. */
export function DryCheck() {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const load = async (f: File) => {
    setBusy(true);
    setErr(null);
    const r = await checkExpected(await f.text());
    setBusy(false);
    if (!("ok" in r) || !r.ok) return setErr(("error" in r && r.error) || "Couldn't check that file.");
    setRes(r);
    if (file.current) file.current.value = "";
  };
  return (
    <div className="font-mono text-[11px]">
      <p className="max-w-2xl leading-[1.8] text-ink-4">
        Drop in an expected-trades file (like Expected_Trades_Sep21_Nov4_2026.csv). Each card is checked against its phase&apos;s rows, on the trading days the bot received signals: same trades, same direction, same stop and target (within 0.25), same skips. Only switch a card to real orders once this shows no differences.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        <Btn onClick={() => file.current?.click()} disabled={busy}>
          {busy ? "Checking…" : "Check an expected-trades file"}
        </Btn>
        {err && <span className="text-neg">{err}</span>}
      </div>
      {res && (
        <div className="mt-6 space-y-6">
          <p className="text-ink-3">
            File: {res.file.rows} trades, {res.file.first} – {res.file.last}. Days with signals in that range: {res.signalDays}.
            {res.signalDays === 0 && <span className="text-gold"> The bot hasn&apos;t received signals on any of those days yet, so there&apos;s nothing to compare. Use a file covering the dry-run days.</span>}
          </p>
          {res.cards.map((c) => (
            <div key={c.card.id} className="border-t border-line-2 pt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ink">
                  {c.card.label} <span className="text-ink-4">· {c.card.phase}</span>
                </span>
                <span className={c.diffs.length ? "text-gold" : "text-pos"}>
                  {c.matched} of {c.expected} matched{c.diffs.length ? ` · ${c.diffs.length} ${c.diffs.length === 1 ? "difference" : "differences"}` : c.expected ? " · no differences" : ""}
                </span>
              </div>
              <ul className="mt-2">
                {c.diffs.map((d, i) => (
                  <li key={i} className="grid grid-cols-[6.5rem_5.5rem_minmax(0,1fr)] gap-x-3 border-b border-line py-1.5 text-[10.5px] max-sm:grid-cols-1">
                    <span className={cn(d.kind === "missing" ? "text-neg" : d.kind === "extra" ? "text-gold" : "text-ink-2")}>{d.kind}</span>
                    <span className="text-ink-3">
                      {d.day} {d.session} {d.dir}
                    </span>
                    <span className="text-ink-4">{d.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
