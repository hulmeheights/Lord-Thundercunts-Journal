"use client";

import { useId, useState, useTransition } from "react";
import { Btn, Field, Panel } from "@/components/m";
import { Seg } from "@/components/m/Seg";
import { addLedgerEntry } from "@/lib/actions/ledger";
import { FIRM_SUGGESTIONS, KIND_LABEL, LEDGER_KINDS, firmKey, signedAmount, type LedgerKind } from "@/lib/analytics/ledger";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Typical items, pre-filled without a price: the owner always types the amount. */
const PRESETS: { label: string; kind: LedgerKind; note: (firm: string) => string }[] = [
  { label: "Combine", kind: "evaluation", note: (f) => (firmKey(f) === "topstep" ? "Trading Combine" : "Evaluation") },
  { label: "Reset", kind: "reset", note: () => "Reset" },
  { label: "Activation", kind: "activation", note: () => "Activation fee" },
  { label: "Data fee", kind: "subscription", note: () => "Market data fee" },
  { label: "Payout", kind: "payout", note: () => "Payout" },
];

type Form = { day: string; firm: string; account: string; kind: LedgerKind; amount: string; note: string };

function parseAmount(s: string): number | null {
  const n = Number(s.replace(/[\s,$]/g, ""));
  return s.trim() && Number.isFinite(n) && n > 0 && n <= 1_000_000 ? Math.round(n * 100) / 100 : null;
}

const chip =
  "font-mono text-[10px] tracking-[0.22em] uppercase transition-colors duration-300 border-b pb-1";

/** "+ Add an entry": a calm, collapsible form with quick presets. */
export function LedgerComposer({ count, today, firms, accounts }: { count: number; today: string; firms: string[]; accounts: string[] }) {
  const uid = useId().replace(/:/g, "");
  const [open, setOpen] = useState(count === 0);
  const [f, setF] = useState<Form>({ day: today, firm: firms[0] ?? FIRM_SUGGESTIONS[0], account: "", kind: "evaluation", amount: "", note: "" });
  const [autoNote, setAutoNote] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<Form>) => {
    setMsg(null);
    setF((c) => ({ ...c, ...p }));
  };

  const amount = parseAmount(f.amount);
  const signed = amount !== null ? signedAmount({ kind: f.kind, amount }) : null;
  const firmChoices = [...new Map([...firms, ...FIRM_SUGGESTIONS].map((x) => [firmKey(x), x])).values()].slice(0, 7);

  const submit = () => {
    if (!f.firm.trim()) return setMsg({ ok: false, text: "Which firm?" });
    if (amount === null) return setMsg({ ok: false, text: "Type the amount you paid or received." });
    start(async () => {
      try {
        const r = await addLedgerEntry({ day: f.day, firm: f.firm, account: f.account || null, kind: f.kind, amount, note: f.note || null });
        if (r.ok) {
          setMsg({ ok: true, text: `Added · ${fmtMoney(signedAmount({ kind: f.kind, amount }), { sign: true, cents: true })} · ${f.firm.trim()}` });
          setF((c) => ({ ...c, amount: "", note: "" }));
          setAutoNote(true);
        } else setMsg({ ok: false, text: r.error });
      } catch {
        setMsg({ ok: false, text: "Couldn't save that — try again." });
      }
    });
  };

  return (
    <div>
      {count === 0 ? (
        <div className="reveal flex flex-wrap items-end justify-between gap-x-10 gap-y-6 border-t border-line pt-[clamp(2.5rem,6vh,3.5rem)]">
          <div>
            <p className="max-w-[22ch] font-serif text-[clamp(1.4rem,3vw,2.2rem)] leading-[1.25] font-light [&_em]:italic">
              Nothing on the books <em>yet</em>.
            </p>
            <p className="mt-5 max-w-[46ch] font-mono text-[12px] leading-[1.9] text-ink-3">
              Log every evaluation, reset, activation and data fee — and every payout. Guardian keeps the running sum, so you always know whether
              the evals are paying for themselves.
            </p>
          </div>
          {!open && (
            <Btn variant="primary" size="lg" onClick={() => setOpen(true)}>
              Add the first entry
            </Btn>
          )}
        </div>
      ) : (
        <div className="reveal flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <span className="font-mono text-[10px] tracking-[0.3em] text-ink-3 uppercase">
            Every entry · {count}
          </span>
          <Btn variant={open ? "ghost" : "secondary"} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`f${uid}`}>
            {open ? "Close ×" : "+ Add an entry"}
          </Btn>
        </div>
      )}

      <div
        id={`f${uid}`}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <form
            className="pt-8"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Panel>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
                <span className="font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">Quick fill</span>
                {PRESETS.map((p) => {
                  const on = f.kind === p.kind && f.note === p.note(f.firm);
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        if (autoNote || !f.note) set({ kind: p.kind, note: p.note(f.firm) });
                        else set({ kind: p.kind });
                        setAutoNote(true);
                      }}
                      className={cn(chip, on ? "border-gold text-ink" : "border-transparent text-ink-3 hover:text-ink")}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-9 border-t border-line pt-8">
                <span className="mb-3 block font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">Kind</span>
                <Seg
                  value={f.kind}
                  onChange={(k) => set({ kind: k })}
                  options={LEDGER_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                  className="gap-x-5 sm:gap-x-6"
                />
              </div>

              <div className="mt-9 grid gap-x-7 gap-y-7 sm:grid-cols-2 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
                <Field label="Date">
                  <input type="date" required className="field" value={f.day} max="2100-12-31" onChange={(e) => set({ day: e.target.value })} />
                </Field>
                <div>
                  <Field label="Firm">
                    <input
                      className="field"
                      value={f.firm}
                      maxLength={60}
                      list={`firms${uid}`}
                      autoComplete="off"
                      onChange={(e) => set({ firm: e.target.value })}
                    />
                  </Field>
                  <datalist id={`firms${uid}`}>
                    {firmChoices.map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                    {firmChoices.map((x) => (
                      <button
                        key={x}
                        type="button"
                        onClick={() => set({ firm: x })}
                        className={cn(chip, "text-[9px] tracking-[0.18em]", firmKey(f.firm) === firmKey(x) ? "border-gold text-ink" : "border-transparent text-ink-4 hover:text-ink-2")}
                      >
                        {x}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2 lg:col-span-1">
                  <Field label="Account · optional">
                    <input className="field" value={f.account} maxLength={80} placeholder="50K · XFA-2231" list={`acc${uid}`} autoComplete="off" onChange={(e) => set({ account: e.target.value })} />
                  </Field>
                  <datalist id={`acc${uid}`}>
                    {accounts.map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="mt-7 grid gap-x-7 gap-y-7 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,2.2fr)]">
                <Field
                  label="Amount"
                  hint={
                    signed !== null ? (
                      <>
                        goes in as <span className={cn("num", signed > 0 ? "text-pos" : "text-neg")}>{fmtMoney(signed, { sign: true, cents: true })}</span>
                      </>
                    ) : (
                      "typed by you — never guessed"
                    )
                  }
                >
                  <span className="relative block">
                    <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-mono text-[13px] text-ink-4">$</span>
                    <input
                      className="field num !pl-7"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      value={f.amount}
                      maxLength={12}
                      onChange={(e) => set({ amount: e.target.value.replace(/[^\d.,]/g, "") })}
                    />
                  </span>
                </Field>
                <Field label="Note · optional">
                  <input
                    className="field"
                    value={f.note}
                    maxLength={280}
                    placeholder="What was it for?"
                    onChange={(e) => {
                      setAutoNote(false);
                      set({ note: e.target.value });
                    }}
                  />
                </Field>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-4">
                <Btn type="submit" variant="primary" size="lg" disabled={pending}>
                  {pending ? "Adding…" : "Add to the ledger"}
                </Btn>
                <span aria-live="polite" className={cn("font-mono text-[10.5px] tracking-[0.08em]", msg?.ok ? "text-pos" : "text-neg")}>
                  {msg && (msg.ok ? `● ${msg.text}` : `— ${msg.text}`)}
                </span>
              </div>
            </Panel>
          </form>
        </div>
      </div>
    </div>
  );
}
