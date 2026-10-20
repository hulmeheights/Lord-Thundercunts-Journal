"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Btn, Field, Panel } from "@/components/m";
import { Seg } from "@/components/m/Seg";
import { addLedgerEntry } from "@/lib/actions/ledger";
import { FIRM_SUGGESTIONS, KIND_LABEL, MONEY_KINDS, OUTCOME_KINDS, firmKey, isOutcome, signedAmount, type LedgerKind } from "@/lib/analytics/ledger";
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

/** Account results: a count, no money. */
const RESULT_HINT: Record<(typeof OUTCOME_KINDS)[number], string> = {
  passed: "Evals that passed — they're funded now.",
  blown: "Evals that hit the drawdown.",
  funded_blown: "Funded accounts that were lost.",
};

type Form = { day: string; firm: string; account: string; kind: LedgerKind; amount: string; qty: string; note: string };

function parseQty(s: string): number | null {
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}

function parseAmount(s: string): number | null {
  const n = Number(s.replace(/[\s,$]/g, ""));
  return s.trim() && Number.isFinite(n) && n > 0 && n <= 1_000_000 ? Math.round(n * 100) / 100 : null;
}

const eyebrow = "mb-3.5 block font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase";
/** Quick fills are actions, so they're square hairline chips — distinct from the Kind tabs, which are state. */
const preset = "inline-flex h-9 items-center border px-3.5 font-mono text-[9.5px] tracking-[0.22em] uppercase transition-colors duration-300";
const firmChip = "border-b pb-1 font-mono text-[9px] tracking-[0.18em] uppercase transition-colors duration-300";

/** "+ Add an entry": a calm, collapsible form with quick presets. */
export function LedgerComposer({ count, today, firms, accounts }: { count: number; today: string; firms: string[]; accounts: string[] }) {
  const uid = useId().replace(/:/g, "");
  const amountRef = useRef<HTMLInputElement>(null);
  const firmRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(count === 0);
  const [f, setF] = useState<Form>({ day: today, firm: firms[0] ?? FIRM_SUGGESTIONS[0], account: "", kind: "evaluation", amount: "", qty: "1", note: "" });
  const [autoNote, setAutoNote] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<Form>) => {
    setMsg(null);
    setF((c) => ({ ...c, ...p }));
  };

  const result = isOutcome(f.kind);
  const qty = parseQty(f.qty);
  const each = parseAmount(f.amount);
  // With several accounts on one line you type the price of one; the ledger keeps the total.
  const amount = each !== null && qty !== null ? Math.round(each * qty * 100) / 100 : null;
  const signed = amount !== null ? signedAmount({ kind: f.kind, amount }) : null;
  const firmChoices = [...new Map([...firms, ...FIRM_SUGGESTIONS].map((x) => [firmKey(x), x])).values()].slice(0, 6);
  const knownFirm = firmChoices.some((x) => firmKey(x) === firmKey(f.firm));

  const submit = () => {
    if (!f.firm.trim()) {
      firmRef.current?.focus();
      return setMsg({ ok: false, text: "Which firm?" });
    }
    if (qty === null) return setMsg({ ok: false, text: "How many — a whole number from 1 to 100." });
    if (!result && amount === null) {
      amountRef.current?.focus();
      return setMsg({ ok: false, text: "Type the amount you paid or received." });
    }
    start(async () => {
      try {
        const r = await addLedgerEntry({ day: f.day, firm: f.firm, account: f.account || null, kind: f.kind, amount: result ? 0 : amount!, qty, note: f.note || null });
        if (r.ok) {
          const what = result
            ? `${qty} ${KIND_LABEL[f.kind].toLowerCase()}`
            : fmtMoney(signedAmount({ kind: f.kind, amount: amount! }), { sign: true, cents: true });
          setMsg({ ok: true, text: `Added · ${what} · ${f.firm.trim()}` });
          setF((c) => ({ ...c, amount: "", qty: "1", note: "" }));
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
              Log every evaluation, reset, activation and data fee, every payout — and mark each account passed or blown. Guardian keeps the
              scoreboard and the running sum, so you always know your pass rate and whether the evals are paying for themselves.
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
          <span className="font-mono text-[10px] tracking-[0.3em] text-ink-3 uppercase">Every entry · {count}</span>
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
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <p className="font-serif text-[clamp(1.3rem,2.4vw,1.7rem)] leading-[1.2] font-light tracking-[-0.01em] [&_em]:italic">
                  {result ? (
                    <>
                      How did the accounts <em>go</em>?
                    </>
                  ) : (
                    <>
                      What did it <em>cost</em> — or pay?
                    </>
                  )}
                </p>
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-4">amounts are always yours to type</span>
              </div>

              <div className="mt-8 border-t border-line pt-8">
                <span className={eyebrow}>Account result · no money, just the count</span>
                <div className="mb-8 flex flex-wrap gap-2.5">
                  {OUTCOME_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={f.kind === k}
                      title={RESULT_HINT[k]}
                      onClick={() => set({ kind: k, note: autoNote || !f.note ? "" : f.note })}
                      className={cn(preset, f.kind === k ? (k === "passed" ? "border-pos/70 text-pos" : "border-ink/45 text-neg") : "border-line text-ink-3 hover:border-line-2 hover:text-ink")}
                    >
                      {KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
                <span className={eyebrow}>Money · quick fill</span>
                <div className="flex flex-wrap gap-2.5">
                  {PRESETS.map((p) => {
                    const on = f.kind === p.kind && f.note === p.note(f.firm);
                    return (
                      <button
                        key={p.label}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          if (autoNote || !f.note) set({ kind: p.kind, note: p.note(f.firm) });
                          else set({ kind: p.kind });
                          setAutoNote(true);
                          amountRef.current?.focus({ preventScroll: true });
                        }}
                        className={cn(preset, on ? "border-gold/70 text-ink" : "border-line text-ink-3 hover:border-line-2 hover:text-ink")}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-8">
                <span className={eyebrow}>Kind</span>
                <Seg
                  value={f.kind}
                  onChange={(k) => set({ kind: k })}
                  options={MONEY_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                  className="gap-x-5 gap-y-3 sm:gap-x-6"
                />
              </div>

              <div className="mt-10 grid gap-x-7 gap-y-7 sm:grid-cols-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)_minmax(0,0.85fr)]">
                <div className={cn("grid gap-x-4", result ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_5.5rem]")}>
                  {!result && (
                    <Field
                      label={qty !== null && qty > 1 ? "Amount each" : "Amount"}
                      hint={
                        signed !== null ? (
                          <>
                            goes in as{" "}
                            <span className={cn("num whitespace-nowrap", signed > 0 ? "text-pos" : "text-neg")}>{fmtMoney(signed, { sign: true, cents: true })}</span>
                            {qty !== null && qty > 1 && <span className="whitespace-nowrap"> · {qty} × {fmtMoney(each!, { cents: true })}</span>}
                          </>
                        ) : (
                          "typed by you — never guessed"
                        )
                      }
                    >
                      <span className="relative block">
                        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-mono text-[13px] text-ink-4">$</span>
                        <input
                          ref={amountRef}
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
                  )}
                  <Field label={result ? "How many accounts" : f.kind === "payout" ? "Payouts" : "Accounts"} hint={result ? RESULT_HINT[f.kind as keyof typeof RESULT_HINT] : undefined}>
                    <input
                      className="field num"
                      inputMode="numeric"
                      autoComplete="off"
                      value={f.qty}
                      maxLength={3}
                      aria-label="How many"
                      onChange={(e) => set({ qty: e.target.value.replace(/[^\d]/g, "") })}
                    />
                  </Field>
                </div>
                <div>
                  <Field label="Firm">
                    <input
                      ref={firmRef}
                      className="field"
                      value={f.firm}
                      maxLength={60}
                      list={`firms${uid}`}
                      autoComplete="off"
                      placeholder="Which firm?"
                      onChange={(e) => set({ firm: e.target.value })}
                    />
                  </Field>
                  <datalist id={`firms${uid}`}>
                    {firmChoices.map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                  <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-2.5">
                    {firmChoices.map((x) => (
                      <button
                        key={x}
                        type="button"
                        aria-pressed={firmKey(f.firm) === firmKey(x)}
                        onClick={() => set({ firm: x })}
                        className={cn(firmChip, firmKey(f.firm) === firmKey(x) ? "border-gold text-ink" : "border-transparent text-ink-4 hover:text-ink-2")}
                      >
                        {x}
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-pressed={!knownFirm}
                      onClick={() => {
                        if (knownFirm) set({ firm: "" });
                        firmRef.current?.focus();
                      }}
                      className={cn(firmChip, !knownFirm ? "border-gold text-ink" : "border-transparent text-ink-4 hover:text-ink-2")}
                    >
                      Other…
                    </button>
                  </div>
                </div>
                <Field label="Date">
                  <input type="date" required className="field" value={f.day} min="2000-01-01" max="2100-12-31" onChange={(e) => set({ day: e.target.value })} />
                </Field>
              </div>

              <div className="mt-7 grid gap-x-7 gap-y-7 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div>
                  <Field label="Account · optional">
                    <input
                      className="field"
                      value={f.account}
                      maxLength={80}
                      placeholder="50K · XFA-2231"
                      list={`acc${uid}`}
                      autoComplete="off"
                      onChange={(e) => set({ account: e.target.value })}
                    />
                  </Field>
                  <datalist id={`acc${uid}`}>
                    {accounts.map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                </div>
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
                <Btn type="submit" variant="primary" size="lg" disabled={pending} className="max-sm:w-full">
                  {pending ? "Adding…" : "Add to the ledger"}
                </Btn>
                <span aria-live="polite" className={cn("font-mono text-[10.5px] leading-[1.7] tracking-[0.08em]", msg?.ok ? "text-pos" : "text-neg")}>
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
