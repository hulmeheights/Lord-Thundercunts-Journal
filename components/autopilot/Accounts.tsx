"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBotAccount, deleteBotAccount, saveBotAccount } from "@/lib/actions/bot";
import type { BotAccountView } from "@/lib/data/bot";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { PHASE_DEFAULTS, type CardRules, type SorSession, type Weekday } from "@/lib/bot/sor";

const SESS: SorSession[] = ["NYAM", "NYPM", "LON", "ASIA"];
const DAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/** The card's own rules (spec: Account settings). Flipping the phase puts back that phase's tested defaults. */
function RulesEditor({ rules, onChange }: { rules: CardRules; onChange: (r: CardRules) => void }) {
  const set = (p: Partial<CardRules>) => onChange({ ...rules, ...p });
  const chip = (on: boolean) => cn("border px-2 py-1 font-mono text-[10px]", on ? "border-gold/60 text-ink" : "border-line text-ink-4");
  const n = "field num h-8 w-14 px-1 py-0 text-center";
  const int = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v.replace(/[^0-9]/g, "")) || lo)));
  return (
    <div className="space-y-3 pt-3 font-mono text-[10.5px] text-ink-3">
      <div className="flex flex-wrap items-center gap-2">
        Signal set
        {(["3/3", "3/2"] as const).map((s) => (
          <button key={s} type="button" className={chip(rules.swing === s)} onClick={() => set({ swing: s })}>
            {s} {s === "3/3" ? "(eval)" : "(funded)"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        Sessions
        {SESS.map((s) => (
          <button key={s} type="button" className={chip(rules.sessions.includes(s))} onClick={() => set({ sessions: rules.sessions.includes(s) ? rules.sessions.filter((x) => x !== s) : [...rules.sessions, s] })}>
            {s}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        Skip days
        {DAYS.map((d) => (
          <button key={d} type="button" className={chip(rules.skipDays.includes(d))} onClick={() => set({ skipDays: rules.skipDays.includes(d) ? rules.skipDays.filter((x) => x !== d) : [...rules.skipDays, d] })}>
            {d}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        Entry window (min)
        {SESS.map((s) => (
          <label key={s} className="flex items-center gap-1">
            {s}
            <input className={n} inputMode="numeric" value={rules.windows[s]} onChange={(e) => set({ windows: { ...rules.windows, [s]: int(e.target.value, 1, 240) } })} />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        Quiet signals
        <button type="button" className={chip(rules.quietMode === "target15")} onClick={() => set({ quietMode: "target15" })}>
          take (15 pt target)
        </button>
        <button type="button" className={chip(rules.quietMode === "skip")} onClick={() => set({ quietMode: "skip" })}>
          skip
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-1">
          Min RR <input className={n} inputMode="decimal" value={rules.minRR} onChange={(e) => set({ minRR: Math.max(0, Math.min(10, Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)) })} />
        </label>
        <label className="flex items-center gap-1">
          Trades a day <input className={n} inputMode="numeric" value={rules.maxTradesDay} onChange={(e) => set({ maxTradesDay: int(e.target.value, 1, 20) })} />
        </label>
        <label className="flex items-center gap-1">
          a session <input className={n} inputMode="numeric" value={rules.maxTradesSession} onChange={(e) => set({ maxTradesSession: int(e.target.value, 1, 10) })} />
        </label>
        <label className="flex items-center gap-1">
          Stop the week after <input className={n} inputMode="numeric" value={rules.weekRedDaysStop} onChange={(e) => set({ weekRedDaysStop: int(e.target.value, 1, 5) })} /> losing days
        </label>
      </div>
    </div>
  );
}

const lab = "mb-1.5 block font-mono text-[9px] tracking-[0.24em] text-ink-4 uppercase";
const money = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

function Card({ a, live, options }: { a: BotAccountView; live: boolean; options: { id: number; name: string }[] }) {
  const router = useRouter();
  const initial = { label: a.label, topstepAccount: a.topstepAccount, contracts: String(a.contracts), maxDailyLoss: String(a.maxDailyLoss), maxDailyWin: a.maxDailyWin ? String(a.maxDailyWin) : "", profitTarget: a.profitTarget ? String(a.profitTarget) : "", startBalance: String(a.startBalance), newsRule: a.newsRule, phase: a.phase, dryRun: a.dryRun, rules: a.rules, enabled: a.enabled };
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => k !== "enabled" && k !== "newsRule" && k !== "phase" && k !== "dryRun" && f[k] !== initial[k]);
  const save = (next = f) =>
    start(async () => {
      setMsg(null);
      const r = await saveBotAccount(a.id, {
        label: next.label,
        topstepAccount: next.topstepAccount,
        contracts: Math.round(Number(next.contracts)),
        maxDailyLoss: Number(next.maxDailyLoss),
        maxDailyWin: next.maxDailyWin.trim() ? Number(next.maxDailyWin) : null,
        profitTarget: next.profitTarget.trim() ? Number(next.profitTarget) : null,
        startBalance: Number(next.startBalance),
        newsRule: next.newsRule,
        phase: next.phase,
        dryRun: next.dryRun,
        rules: next.rules,
        enabled: next.enabled,
      });
      if ("error" in r && r.error) return setMsg(r.error);
      setMsg("Saved");
      router.refresh();
    });
  const num = "field num h-9 w-full px-2 py-0";
  return (
    <div className={cn("border border-line-2 p-4", f.enabled ? (live ? "border-neg/40" : "border-gold/40") : "opacity-80")}>
      <div className="flex items-center gap-3">
        <input className="field h-9 min-w-0 flex-1 font-mono text-[12px]" value={f.label} maxLength={60} aria-label="Card name" onChange={(e) => setF({ ...f, label: e.target.value })} />
        <Toggle
          checked={f.enabled}
          label={`Mirror to ${f.label}`}
          onChange={(v) => {
            const next = { ...f, enabled: v };
            setF(next);
            save(next);
          }}
        />
      </div>
      <div className="mt-1.5 font-mono text-[10px] text-ink-4">
        {f.enabled ? (f.dryRun ? "On · dry run" : live ? "On · real orders" : "On · paper") : "Off · skipped"} · today <span className={a.today > 0 ? "text-pos" : a.today < 0 ? "text-neg" : ""}>{money(a.today)}</span>
      </div>
      {/* One click sets the account type and puts back every tested setting for it; the Rules panel stays free to fine-tune. */}
      <div className="mt-4">
        <span className={lab}>Account type</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`${f.label} account type`}>
          {(["eval", "funded"] as const).map((ph) => (
            <button
              key={ph}
              type="button"
              role="radio"
              aria-checked={f.phase === ph}
              disabled={pending}
              onClick={() => {
                if (f.phase === ph) return;
                const next = { ...f, phase: ph, rules: PHASE_DEFAULTS[ph], maxDailyWin: "1600", maxDailyLoss: "500" };
                setF(next);
                save(next);
              }}
              className={cn("border px-3 py-2 text-left font-mono transition-colors", f.phase === ph ? "border-gold/70 bg-gold/10 text-ink" : "border-line text-ink-4 hover:text-ink-2")}
            >
              <span className="block text-[11px]">{ph === "eval" ? "Eval / Combine" : "Funded / Express"}</span>
              <span className="mt-0.5 block text-[9.5px] leading-[1.5] text-ink-4">{ph === "eval" ? "3/3 · NY AM, NY PM, London · skips Thu · quiet = 15 pt" : "3/2 · all 4 sessions · every day · 150 min · skips quiet"}</span>
            </button>
          ))}
        </div>
        <span className="mt-1.5 block font-mono text-[9.5px] text-ink-4">Picking one sets its tested rules, $1,600 day target and −$500 day loss. Fine-tune anything under Rules.</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="col-span-2">
          <span className={lab}>TopstepX account (name or ID)</span>
          <input className="field h-9 w-full font-mono text-[11.5px]" list="ltj-tsx" value={f.topstepAccount} maxLength={80} placeholder="e.g. 50KTC-V2-…" onChange={(e) => setF({ ...f, topstepAccount: e.target.value })} />
          {!f.topstepAccount.trim() && <span className="mt-1 block font-mono text-[10px] text-gold">Live orders skip a card with no account.</span>}
          {f.topstepAccount.trim() && options.length > 0 && !options.some((o) => String(o.id) === f.topstepAccount.trim() || o.name.toLowerCase().includes(f.topstepAccount.trim().toLowerCase())) && (
            <span className="mt-1 block font-mono text-[10px] text-neg">No TopstepX account matches this.</span>
          )}
        </label>
        <label>
          <span className={lab}>Contracts</span>
          <input className={num} inputMode="numeric" value={f.contracts} onChange={(e) => setF({ ...f, contracts: e.target.value.replace(/\D/g, "") })} />
        </label>
        <label>
          <span className={lab}>Max daily loss $</span>
          <input className={num} inputMode="decimal" value={f.maxDailyLoss} onChange={(e) => setF({ ...f, maxDailyLoss: e.target.value.replace(/[^0-9.]/g, "") })} />
        </label>
        <label className="col-span-2">
          <span className={lab}>Max daily win $ (consistency cap · blank = none)</span>
          <input className={num} inputMode="decimal" value={f.maxDailyWin} placeholder="e.g. 1600" onChange={(e) => setF({ ...f, maxDailyWin: e.target.value.replace(/[^0-9.]/g, "") })} />
        </label>
        <label>
          <span className={lab}>Account profit target $</span>
          <input className={num} inputMode="decimal" value={f.profitTarget} placeholder="blank = no target" onChange={(e) => setF({ ...f, profitTarget: e.target.value.replace(/[^0-9.]/g, "") })} />
        </label>
        <label>
          <span className={lab}>Starting balance $</span>
          <input className={num} inputMode="decimal" value={f.startBalance} onChange={(e) => setF({ ...f, startBalance: e.target.value.replace(/[^0-9.]/g, "") })} />
        </label>
        {/* Two plain buttons, so it's always obvious which one the card is on. */}
        <div className="col-span-2 border-t border-line pt-2.5">
          <span className={lab}>Orders</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`${f.label} orders`}>
            {([true, false] as const).map((dry) => (
              <button
                key={String(dry)}
                type="button"
                role="radio"
                aria-checked={f.dryRun === dry}
                disabled={pending}
                onClick={() => {
                  if (f.dryRun === dry) return;
                  if (!dry && !window.confirm(`Switch ${f.label} to REAL orders? The bot will place real trades on this account when Autopilot is Live.`)) return;
                  const next = { ...f, dryRun: dry };
                  setF(next);
                  save(next);
                }}
                className={cn(
                  "border px-3 py-2 text-left font-mono transition-colors",
                  f.dryRun === dry ? (dry ? "border-gold/70 bg-gold/10 text-ink" : "border-neg/70 bg-neg/10 text-ink") : "border-line text-ink-4 hover:text-ink-2",
                )}
              >
                <span className="block text-[11px]">{dry ? "Dry run" : "Real orders"}</span>
                <span className="mt-0.5 block text-[9.5px] leading-[1.5] text-ink-4">{dry ? "Logs every decision, places nothing" : "Places real trades at Topstep"}</span>
              </button>
            ))}
          </div>
        </div>
        <details className="col-span-2 border-t border-line pt-2.5">
          <summary className="cursor-pointer font-mono text-[10.5px] text-ink-2">
            Rules <span className="text-ink-4">· {f.rules.swing} · {f.rules.sessions.join(" ")} · {f.rules.skipDays.length ? `skips ${f.rules.skipDays.join(" ")}` : "every day"} · quiet {f.rules.quietMode === "skip" ? "skipped" : "15 pt"}</span>
          </summary>
          <RulesEditor rules={f.rules} onChange={(rules) => setF({ ...f, rules })} />
          <button type="button" className="mt-3 font-mono text-[9.5px] tracking-[0.2em] text-ink-4 uppercase hover:text-ink" onClick={() => setF({ ...f, rules: PHASE_DEFAULTS[f.phase] })}>
            Back to the tested {f.phase} defaults
          </button>
        </details>
        <div className="col-span-2 flex items-center justify-between gap-4 border-y border-line py-2.5">
          <span className="font-mono text-[10.5px] leading-[1.6] text-ink-2">
            Follows the news blackout
            <span className="block text-[9.5px] text-ink-4">{f.newsRule ? "On: sits out ±minutes around big news (Topstep needs this)" : "Off: trades through news (for firms without a news rule)"}</span>
          </span>
          <Toggle
            checked={f.newsRule}
            label={`News blackout for ${f.label}`}
            onChange={(v) => {
              const next = { ...f, newsRule: v };
              setF(next);
              save(next);
            }}
          />
        </div>
        <p className="col-span-2 font-mono text-[10px] leading-[1.7] text-ink-4">
          {a.passedAt && !f.enabled ? (
            <span className="text-pos">✓ Profit target reached: switched itself off. Clear the target (or raise it) before switching it back on.</span>
          ) : a.profitTarget ? (
            a.profit == null ? (
              "Progress shows after its first live trade."
            ) : a.profit >= a.profitTarget ? (
              <span className="text-pos">Target reached: switches off at the next check.</span>
            ) : (
              <>
                {money(a.profit)} of ${a.profitTarget.toLocaleString("en-GB")} · ${Math.round(a.profitTarget - a.profit).toLocaleString("en-GB")} to go. The trade that crosses it closes at its own target; then the card switches off.
              </>
            )
          ) : (
            "No target: it trades for as long as it's switched on."
          )}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button size="sm" variant={dirty ? "primary" : "secondary"} disabled={pending || !dirty} onClick={() => save()}>
          {pending ? "Saving…" : "Save card"}
        </Button>
        {!a.enabled && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteBotAccount(a.id);
                if ("error" in r && r.error) return setMsg(r.error);
                router.refresh();
              })
            }
            className="font-mono text-[9.5px] tracking-[0.26em] text-ink-4 uppercase hover:text-neg"
          >
            Delete
          </button>
        )}
        {msg && <span className={cn("font-mono text-[10.5px]", msg === "Saved" ? "text-pos" : "text-neg")}>{msg}</span>}
      </div>
    </div>
  );
}

/** One card per TopstepX account the bot mirrors to. The account list comes from your Mac (the website never contacts Topstep). */
export function Accounts({ accounts, live, macAccounts, macAccountsAt }: { accounts: BotAccountView[]; live: boolean; macAccounts: { id: number; name: string; canTrade: boolean; balance: number | null }[]; macAccountsAt: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <datalist id="ltj-tsx">
        {macAccounts.map((o) => (
          <option key={o.id} value={o.name} />
        ))}
      </datalist>
      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map((a) => (
          <Card key={a.id} a={a} live={live} options={macAccounts} />
        ))}
      </div>
      {accounts.length === 0 && <p className="font-mono text-[11.5px] text-ink-3">No cards yet. Add one for each TopstepX account the bot should trade.</p>}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErr(null);
              const r = await addBotAccount();
              if ("error" in r && r.error) return setErr(r.error);
              router.refresh();
            })
          }
        >
          + Add account
        </Button>
      </div>
      {err && <p className="mt-3 font-mono text-[11px] text-neg">{err}</p>}
      <div className="mt-6">
        <div className="mb-2 font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">Your TopstepX accounts · from your Mac{macAccountsAt ? ` · ${macAccountsAt}` : ""}</div>
        {macAccounts.length === 0 ? (
          <p className="font-mono text-[11px] text-ink-3">Your Mac sends this list when it starts and around each session. Pick from it when you fill a card in.</p>
        ) : (
          <ul className="border-t border-line">
            {macAccounts.map((o) => (
              <li key={o.id} className="flex flex-wrap justify-between gap-x-4 border-b border-line py-2.5 font-mono text-[11px]">
                <span className="text-ink">{o.name}</span>
                <span className="text-ink-4">
                  ID {o.id}
                  {o.balance !== null && ` · $${o.balance.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`}
                  {!o.canTrade && " · can't trade"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
