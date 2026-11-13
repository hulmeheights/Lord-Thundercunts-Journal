"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPassAccount, deletePassAccount, savePassAccount, setPassMode } from "@/lib/actions/pass";
import type { PassAccountView } from "@/lib/data/pass";
import { cn } from "@/lib/cn";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";

const lab = "mb-1.5 block font-mono text-[9px] tracking-[0.24em] text-ink-4 uppercase";
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-GB")}`;
const chip = (on: boolean) => cn("border px-3 py-2 text-left font-mono transition-colors", on ? "border-gold/70 bg-gold/10 text-ink" : "border-line text-ink-4 hover:text-ink-2");

/** The pass plan's own switch. */
export function PassSwitch({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="grid max-w-md grid-cols-2 border border-line-2" role="radiogroup" aria-label="Pass plan">
      {[false, true].map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={on === v}
          disabled={pending}
          onClick={() => {
            if (on === v) return;
            if (v && !confirm("Switch the pass plan ON? Cards on real orders will trade from your Mac at the next session.")) return;
            start(async () => {
              await setPassMode(v);
              router.refresh();
            });
          }}
          className={cn("h-14 font-mono text-[11px] tracking-[0.3em] uppercase transition-colors [&+&]:border-l [&+&]:border-line-2", on === v ? (v ? "bg-pos/10 text-pos" : "bg-ink/5 text-ink") : "text-ink-4 hover:text-ink")}
        >
          {v ? "On" : "Off"}
        </button>
      ))}
    </div>
  );
}

const STAGES = {
  topstep: [
    ["eval", "Eval / Combine", "$1,000 risk · $1,640 day cap · pass at $3,000 with best day ≤ 55%"],
    ["funded", "Funded / Express", "$1,000 risk · $1,640 day cap · 5 winning days, then to $8,000 · payout"],
  ],
  lucid: [
    ["eval", "Step 1 (eval)", "$1,000 risk · $1,200 day cap · pass at $3,000 with best day ≤ 40%"],
    ["prelive", "Pre-live (step 2)", "$1,250 risk · up to $2,000 a day · pass at $2,000"],
  ],
} as const;

function Card({ a, options }: { a: PassAccountView; options: { id: number; name: string }[] }) {
  const router = useRouter();
  const init = {
    label: a.label,
    firm: a.firm,
    stage: a.stage,
    script: a.script,
    topstepAccount: a.topstepAccount,
    contracts: String(a.contracts),
    dll: a.dll,
    enabled: a.enabled,
    dryRun: a.dryRun,
    baseProfit: String(a.baseProfit),
    baseBest: String(a.baseBest),
    baseWinDays: String(a.baseWinDays),
  };
  const [f, setF] = useState(init);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (next = f) =>
    start(async () => {
      setMsg(null);
      const r = await savePassAccount(a.id, {
        label: next.label,
        firm: next.firm,
        stage: next.stage,
        script: next.script,
        topstepAccount: next.topstepAccount,
        contracts: Math.round(Number(next.contracts)) || 10,
        dll: next.dll,
        enabled: next.enabled,
        dryRun: next.dryRun,
        baseProfit: Number(next.baseProfit) || 0,
        baseBest: Number(next.baseBest) || 0,
        baseWinDays: Math.round(Number(next.baseWinDays)) || 0,
      });
      if ("error" in r && r.error) {
        setMsg(r.error);
        setF(init);
        return;
      }
      setMsg("Saved");
      router.refresh();
    });
  const set = (p: Partial<typeof f>, now = true) => {
    const next = { ...f, ...p };
    setF(next);
    if (now) save(next);
  };
  const num = "field num h-9 w-full px-2 py-0";
  const lucid = f.firm === "lucid";
  const s = a.stats;
  const status = !f.enabled
    ? a.done
      ? `Off · ${a.done === "blown" ? "blown" : a.done === "payout" ? "payout ready" : "passed"}`
      : "Off"
    : lucid
      ? "On · tells you each trade (Lucid: you place it)"
      : f.dryRun
        ? "On · practice (no orders)"
        : "On · real orders at Topstep";
  return (
    <div className={cn("border p-4", f.enabled ? (a.mode === "live" ? "border-neg/40" : "border-gold/40") : "border-line-2 opacity-85")}>
      <div className="flex items-center gap-3">
        <input className="field h-9 min-w-0 flex-1 font-mono text-[12px]" value={f.label} maxLength={60} aria-label="Card name" onChange={(e) => setF({ ...f, label: e.target.value })} onBlur={() => f.label !== init.label && save()} />
        <Toggle checked={f.enabled} label={`Trade ${f.label}`} onChange={(v) => set({ enabled: v })} />
      </div>
      <div className="mt-1.5 font-mono text-[10px] text-ink-4">{status}</div>
      {a.doneNote && <div className="mt-1 font-mono text-[10px] text-gold">{a.doneNote}</div>}

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-y border-line py-2.5 font-mono text-[10.5px] text-ink-3 sm:grid-cols-3">
        <span>
          Profit <b className={cn("font-normal", s.profit > 0 ? "text-pos" : s.profit < 0 ? "text-neg" : "text-ink")}>{money(s.profit)}</b>
        </span>
        <span>
          Today <b className={cn("font-normal", s.today > 0 ? "text-pos" : s.today < 0 ? "text-neg" : "text-ink")}>{money(s.today)}</b>
        </span>
        <span>
          Today&apos;s goal <b className="font-normal text-ink">{money(Math.max(0, s.goal))}</b>
        </span>
        <span>
          Best day <b className="font-normal text-ink">{money(s.best)}</b>
        </span>
        <span>
          Winning days <b className="font-normal text-ink">{s.winDays}</b>
        </span>
        <span>
          Loss limit at <b className="font-normal text-ink">{money(s.floor)}</b>
        </span>
      </div>

      <div className="mt-3">
        <span className={lab}>Firm</span>
        <div className="grid grid-cols-2 gap-2">
          {(["topstep", "lucid"] as const).map((fm) => (
            <button key={fm} type="button" disabled={pending} className={chip(f.firm === fm)} onClick={() => f.firm !== fm && set({ firm: fm, stage: "eval", script: fm === "lucid" ? "C" : "D" })}>
              <span className="block text-[11px]">{fm === "topstep" ? "Topstep" : "Lucid (LucidMaxx)"}</span>
              <span className="mt-0.5 block text-[9.5px] text-ink-4">{fm === "topstep" ? "the bot places the orders" : "you place them: the bot tells you each trade"}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <span className={lab}>Stage</span>
        <div className="grid grid-cols-2 gap-2">
          {STAGES[f.firm].map(([st, name, hint]) => (
            <button key={st} type="button" disabled={pending} className={chip(f.stage === st)} onClick={() => f.stage !== st && set({ stage: st })}>
              <span className="block text-[11px]">{name}</span>
              <span className="mt-0.5 block text-[9.5px] leading-[1.5] text-ink-4">{hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <span className={lab}>Script</span>
        <div className="grid grid-cols-3 gap-2">
          {(["D", "C", "A"] as const).map((sc) => (
            <button key={sc} type="button" disabled={pending} className={chip(f.script === sc)} onClick={() => f.script !== sc && set({ script: sc })}>
              <span className="block text-[11px]">Script {sc}</span>
              <span className="mt-0.5 block text-[9.5px] leading-[1.5] text-ink-4">{sc === "D" ? "fast eval: no filter in eval, both filters once funded" : sc === "C" ? "both filters in every stage (4H bias + outside value area)" : "no filters ever (the original)"}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {!lucid && (
          <label className="col-span-2">
            <span className={lab}>TopstepX account (name or ID)</span>
            <input className="field h-9 w-full font-mono text-[11.5px]" list="ltj-tsx" value={f.topstepAccount} maxLength={80} placeholder="e.g. 50KTC-V2-…" onChange={(e) => setF({ ...f, topstepAccount: e.target.value })} onBlur={() => f.topstepAccount !== init.topstepAccount && save()} />
            {f.topstepAccount.trim() && options.length > 0 && !options.some((o) => String(o.id) === f.topstepAccount.trim() || o.name.toLowerCase().includes(f.topstepAccount.trim().toLowerCase())) && (
              <span className="mt-1 block font-mono text-[10px] text-neg">No TopstepX account matches this.</span>
            )}
          </label>
        )}
        <label>
          <span className={lab}>Contracts (MNQ)</span>
          <input className={num} inputMode="numeric" value={f.contracts} onChange={(e) => setF({ ...f, contracts: e.target.value.replace(/\D/g, "") })} onBlur={() => f.contracts !== init.contracts && save()} />
        </label>
        {!lucid && (
          <label className="flex items-end gap-2 pb-2 font-mono text-[10.5px] text-ink-3">
            <Toggle checked={f.dll} label="Bought with the daily loss limit" onChange={(v) => set({ dll: v })} />
            With daily loss limit
          </label>
        )}
      </div>

      <details className="mt-3 font-mono text-[10.5px] text-ink-3">
        <summary className="cursor-pointer text-ink-4">Already traded this account before the bot?</summary>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <label>
            <span className={lab}>Profit $</span>
            <input className={num} inputMode="decimal" value={f.baseProfit} onChange={(e) => setF({ ...f, baseProfit: e.target.value.replace(/[^0-9.-]/g, "") })} onBlur={() => save()} />
          </label>
          <label>
            <span className={lab}>Best day $</span>
            <input className={num} inputMode="decimal" value={f.baseBest} onChange={(e) => setF({ ...f, baseBest: e.target.value.replace(/[^0-9.]/g, "") })} onBlur={() => save()} />
          </label>
          <label>
            <span className={lab}>Winning days</span>
            <input className={num} inputMode="numeric" value={f.baseWinDays} onChange={(e) => setF({ ...f, baseWinDays: e.target.value.replace(/\D/g, "") })} onBlur={() => save()} />
          </label>
        </div>
      </details>

      {!lucid && (
        <div className="mt-3 border-t border-line pt-2.5">
          <span className={lab}>Orders</span>
          <div className="grid grid-cols-2 gap-2">
            {([true, false] as const).map((dry) => (
              <button
                key={String(dry)}
                type="button"
                disabled={pending}
                className={cn(chip(f.dryRun === dry), !dry && f.dryRun === dry && "border-neg/60 bg-neg/10")}
                onClick={() => {
                  if (f.dryRun === dry) return;
                  if (!dry && !confirm(`Switch ${f.label} to REAL orders? Your Mac will place real trades on this Topstep account when the pass plan is on.`)) return;
                  set({ dryRun: dry });
                }}
              >
                <span className="block text-[11px]">{dry ? "Practice" : "Real orders"}</span>
                <span className="mt-0.5 block text-[9.5px] text-ink-4">{dry ? "follows every trade, places nothing" : "places real trades at Topstep"}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-ink-4">
        <span>{pending ? "Saving…" : msg}</span>
        {!f.enabled && (
          <button
            type="button"
            className="hover:text-neg"
            onClick={() =>
              confirm(`Delete ${f.label}? Its trades stay in the book.`) &&
              start(async () => {
                const r = await deletePassAccount(a.id);
                if ("error" in r && r.error) setMsg(r.error);
                router.refresh();
              })
            }
          >
            Delete card
          </button>
        )}
      </div>
    </div>
  );
}

export function PassAccounts({ accounts, options }: { accounts: PassAccountView[]; options: { id: number; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const add = (firm: "topstep" | "lucid") =>
    start(async () => {
      await addPassAccount(firm);
      router.refresh();
    });
  return (
    <div>
      <datalist id="ltj-tsx">
        {options.map((o) => (
          <option key={o.id} value={o.name} />
        ))}
      </datalist>
      <div className="grid gap-4 lg:grid-cols-2">
        {accounts.map((a) => (
          <Card key={`${a.id}-${a.stage}-${a.firm}-${a.enabled}`} a={a} options={options} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button disabled={pending} onClick={() => add("topstep")}>
          + Topstep account
        </Button>
        <Button disabled={pending} onClick={() => add("lucid")}>
          + Lucid account
        </Button>
      </div>
    </div>
  );
}
