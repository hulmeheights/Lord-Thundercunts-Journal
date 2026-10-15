"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addManualTrade } from "@/lib/actions/trades";
import { todayKey } from "@/lib/analytics/time";
import { pointValueFor, rootFromSymbol } from "@/lib/brokers/contracts";
import { fmtMoney, fmtNum } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Btn, Field } from "@/components/m";
import { Seg } from "@/components/m/Seg";
import { Choice } from "./Choice";

type Draft = { symbol: string; qty: number; entry: number; exit: number; fees: number; pv: number | null };

export function ManualTradeForm({ setups, tz, onDone }: { setups: string[]; tz: string; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [setup, setSetup] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ symbol: "", qty: 1, entry: 0, exit: 0, fees: 0, pv: null });

  // A live read of what the trade made, before you save it.
  const root = draft.symbol ? rootFromSymbol(draft.symbol) : "";
  const pv = draft.pv ?? (root ? pointValueFor(root) : null);
  const pts = draft.entry > 0 && draft.exit > 0 ? (direction === "long" ? draft.exit - draft.entry : draft.entry - draft.exit) : null;
  const gross = pts !== null && pv ? pts * draft.qty * pv : null;

  return (
    <form
      className="space-y-7"
      onChange={(e) => {
        const f = new FormData(e.currentTarget);
        const num = (k: string) => Number(f.get(k)) || 0;
        setDraft({ symbol: String(f.get("symbol") ?? "").trim(), qty: num("qty"), entry: num("entryPrice"), exit: num("exitPrice"), fees: num("fees"), pv: num("pointValue") || null });
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const n = (k: string) => Number(f.get(k));
        setError(null);
        start(async () => {
          const res = await addManualTrade({
            symbol: String(f.get("symbol")),
            direction,
            qty: n("qty"),
            day: String(f.get("day")),
            entryTime: String(f.get("entryTime")),
            exitTime: String(f.get("exitTime")),
            entryPrice: n("entryPrice"),
            exitPrice: n("exitPrice"),
            fees: n("fees") || 0,
            pointValue: f.get("pointValue") ? n("pointValue") : null,
            setup,
          });
          if (res.error) setError(res.error);
          else {
            onDone();
            router.push(`/trades/${encodeURIComponent(res.id!)}`);
          }
        });
      }}
    >
      <div className="grid grid-cols-[1fr_7rem] gap-x-5 gap-y-7">
        <Field label="Symbol">
          <input name="symbol" required placeholder="MNQZ6" autoCapitalize="characters" autoComplete="off" className="field uppercase placeholder:normal-case" />
        </Field>
        <Field label="Contracts">
          <input name="qty" type="number" min="1" step="1" defaultValue={1} required inputMode="numeric" className="field num" />
        </Field>
      </div>

      <div>
        <span className="mb-3 block font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">Direction</span>
        <Seg
          value={direction}
          onChange={setDirection}
          options={[
            { value: "long", label: "Long" },
            { value: "short", label: "Short" },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-[1.3fr_1fr_1fr]">
        <Field label="Date" className="col-span-2 sm:col-span-1">
          <input name="day" type="date" required defaultValue={todayKey(tz)} className="field num" />
        </Field>
        <Field label="Entry time">
          <input name="entryTime" type="time" required defaultValue="09:45" className="field num" />
        </Field>
        <Field label="Exit time">
          <input name="exitTime" type="time" required defaultValue="09:52" className="field num" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-7">
        <Field label="Entry price">
          <input name="entryPrice" type="number" step="any" required inputMode="decimal" className="field num" />
        </Field>
        <Field label="Exit price">
          <input name="exitPrice" type="number" step="any" required inputMode="decimal" className="field num" />
        </Field>
        <Field label="Fees ($)">
          <input name="fees" type="number" step="any" min="0" defaultValue={0} inputMode="decimal" className="field num" />
        </Field>
        <Field label="$ per point" hint={root && pointValueFor(root) ? `${root} is $${pointValueFor(root)} a point.` : "Filled in for known contracts."}>
          <input name="pointValue" type="number" step="any" min="0" placeholder="auto" inputMode="decimal" className="field num" />
        </Field>
      </div>

      <div>
        <span className="mb-3 block font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">Setup</span>
        <div className="flex flex-wrap gap-2">
          {setups.map((s) => (
            <Choice key={s} active={setup === s} onClick={() => setSetup(setup === s ? null : s)}>
              {s}
            </Choice>
          ))}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-4 border-t border-line pt-5 font-mono">
        <span className="text-[9.5px] tracking-[0.26em] text-ink-4 uppercase">
          {pts === null ? "Gross · waiting for prices" : (
            <>
              <span className="num tracking-normal text-ink-3">
                {pts > 0 ? "+" : pts < 0 ? "−" : ""}
                {fmtNum(Math.abs(pts), 2)}
              </span>{" "}
              pts × {draft.qty || 0}
              {pv ? ` × $${pv}` : " · unknown $/pt"}
            </>
          )}
        </span>
        <span className={cn("num text-[clamp(1.2rem,2.4vw,1.5rem)] font-light", gross === null ? "text-ink-4" : gross > 0 ? "text-pos" : gross < 0 ? "text-neg" : "text-ink")}>
          {gross === null ? "—" : fmtMoney(gross - draft.fees, { sign: true, cents: true })}
        </span>
      </div>

      {error && (
        <p role="alert" className="border-l-2 border-gold pl-4 font-mono text-[12px] leading-[1.8] text-ink-2">
          {error}
        </p>
      )}

      <Btn type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save trade"}
      </Btn>
    </form>
  );
}
