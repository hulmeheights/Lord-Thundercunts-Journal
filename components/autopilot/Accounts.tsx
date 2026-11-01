"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBotAccount, deleteBotAccount, saveBotAccount } from "@/lib/actions/bot";
import type { BotAccountView } from "@/lib/data/bot";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";

const lab = "mb-1.5 block font-mono text-[9px] tracking-[0.24em] text-ink-4 uppercase";
const money = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

function Card({ a, live, options }: { a: BotAccountView; live: boolean; options: { id: number; name: string }[] }) {
  const router = useRouter();
  const initial = { label: a.label, topstepAccount: a.topstepAccount, contracts: String(a.contracts), maxDailyLoss: String(a.maxDailyLoss), maxDailyWin: a.maxDailyWin ? String(a.maxDailyWin) : "", profitTarget: a.profitTarget ? String(a.profitTarget) : "", startBalance: String(a.startBalance), newsRule: a.newsRule, enabled: a.enabled };
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => k !== "enabled" && k !== "newsRule" && f[k] !== initial[k]);
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
        {f.enabled ? (live ? "On · real orders" : "On · paper") : "Off · skipped"} · today <span className={a.today > 0 ? "text-pos" : a.today < 0 ? "text-neg" : ""}>{money(a.today)}</span>
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
