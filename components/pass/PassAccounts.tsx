"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPassAccount, deletePassAccount, payoutTaken, resetPassSettings, savePassAccount, setPassMode } from "@/lib/actions/pass";
import type { PassAccountView } from "@/lib/data/pass";
import type { StageCfg } from "@/lib/pass/rules";
import { cn } from "@/lib/cn";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";

const lab = "mb-1.5 block font-mono text-[9px] tracking-[0.24em] text-ink-4 uppercase";
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-GB")}`;
const chip = (on: boolean) => cn("border px-3 py-2 text-left font-mono transition-colors", on ? "border-gold/70 bg-gold/10 text-ink" : "border-line text-ink-4 hover:text-ink-2");
const pill = (on: boolean) => cn("border px-2.5 py-1 font-mono text-[10px] transition-colors", on ? "border-gold/60 text-ink" : "border-line text-ink-4 hover:text-ink-2");

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
            if (v && !confirm("Switch the pass plan ON? Cards on real orders will trade from your Mac at the next signal.")) return;
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
    ["eval", "Eval / Combine"],
    ["funded", "Funded / Express"],
  ],
  lucid: [
    ["eval", "Step 1 (eval)"],
    ["prelive", "Pre-live (step 2)"],
  ],
} as const;

type NumKey = { [K in keyof StageCfg]: StageCfg[K] extends number | null ? K : never }[keyof StageCfg];
type BoolKey = { [K in keyof StageCfg]: StageCfg[K] extends boolean ? K : never }[keyof StageCfg];
/** The form's copy of a stage's settings: numbers as typed text (blank = off, where a setting can be off). */
type Form = Record<string, string | boolean>;
const NUMS: NumKey[] = ["contracts", "stopPts", "dayGoal", "targetValue", "maxTradesDay", "stopAfterLosses", "dayLossStop", "minTarget", "passTarget", "consistency", "passMargin", "mll", "dllAmount", "payoutBalance", "payoutAmount", "winDaysNeeded", "winDay", "sorContracts"];
const show = (k: string, v: number | null) => (v === null ? "" : k === "consistency" ? String(Math.round(v * 1000) / 10) : String(v));
const toForm = (c: StageCfg): Form => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === "boolean" || k === "targetMode" ? (v as string | boolean) : show(k, v as number | null)]));
/** What's sent to save: text back to numbers (a blank becomes "off" where that's allowed, else the tested default). */
function toSettings(f: Form, d: StageCfg): Record<string, number | boolean | string | null> {
  const out: Record<string, number | boolean | string | null> = {};
  for (const [k, v] of Object.entries(f)) {
    if (typeof v === "boolean" || k === "targetMode") out[k] = v;
    else if (v.trim() === "") out[k] = (d as Record<string, unknown>)[k] === null || ["dayLossStop", "passTarget", "consistency", "dllAmount", "payoutBalance"].includes(k) ? null : ((d as Record<string, unknown>)[k] as number);
    else out[k] = k === "consistency" ? Number(v) / 100 : Number(v);
  }
  return out;
}

function Group({ title, note, children, open }: { title: string; note?: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="border-t border-line py-2.5" open={open}>
      <summary className="flex cursor-pointer items-baseline justify-between gap-3 font-mono text-[10px] tracking-[0.22em] text-ink-2 uppercase">
        <span>{title}</span>
        {note && <span className="truncate text-[9.5px] tracking-normal text-ink-4 normal-case">{note}</span>}
      </summary>
      <div className="mt-3 space-y-3 font-mono text-[10.5px] text-ink-3">{children}</div>
    </details>
  );
}

function Card({ a, options }: { a: PassAccountView; options: { id: number; name: string }[] }) {
  const router = useRouter();
  const init = {
    label: a.label,
    firm: a.firm,
    stage: a.stage,
    topstepAccount: a.topstepAccount,
    dll: a.dll,
    enabled: a.enabled,
    dryRun: a.dryRun,
    baseProfit: String(a.baseProfit),
    baseBest: String(a.baseBest),
    baseWinDays: String(a.baseWinDays),
    floorLocked: a.floorLocked,
    cfg: toForm(a.cfg),
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
        script: "C",
        topstepAccount: next.topstepAccount,
        dll: next.dll,
        settings: toSettings(next.cfg, a.defaults),
        floorLocked: next.floorLocked,
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
  const cfg = (p: Form, now = true) => set({ cfg: { ...f.cfg, ...p } }, now);
  const dirty = (k: string) => f.cfg[k] !== init.cfg[k];
  const num = "field num h-9 w-full px-2 py-0";
  const lucid = f.firm === "lucid";
  const funded = f.stage === "funded";
  const s = a.stats;
  const changed = new Set(a.changed);

  /** A number you can change: saves when you leave the box; gold when it differs from the tested plan. */
  const N = ({ k, label, pre, suf, blank, dec = true }: { k: NumKey; label: string; pre?: string; suf?: string; blank?: string; dec?: boolean }) => (
    <label className="block min-w-0">
      <span className={cn(lab, changed.has(k) && "text-gold")}>{label}</span>
      <span className="flex items-center gap-1.5">
        {pre && <span className="text-ink-4">{pre}</span>}
        <input
          className={num}
          inputMode={dec ? "decimal" : "numeric"}
          value={f.cfg[k] as string}
          placeholder={blank}
          aria-label={label}
          onChange={(e) => cfg({ [k]: e.target.value.replace(dec ? /[^0-9.]/g : /\D/g, "") }, false)}
          onBlur={() => dirty(k) && save()}
        />
        {suf && <span className="shrink-0 text-ink-4">{suf}</span>}
      </span>
    </label>
  );
  const T = ({ k, children }: { k: BoolKey; children: React.ReactNode }) => (
    <label className="flex items-start gap-2.5 leading-[1.6]">
      <span className="mt-0.5">
        <Toggle checked={f.cfg[k] as boolean} label={k} onChange={(v) => cfg({ [k]: v })} />
      </span>
      <span className={changed.has(k) ? "text-gold" : undefined}>{children}</span>
    </label>
  );

  const contracts = Number(f.cfg.contracts) || a.cfg.contracts;
  const stopPts = Number(f.cfg.stopPts) || a.cfg.stopPts;
  const status = !f.enabled
    ? a.done
      ? `Off · ${a.done === "blown" ? "blown" : a.done === "payout" ? "payout ready" : "passed"}`
      : "Off"
    : lucid
      ? "On · tells you each trade (Lucid: you place it)"
      : f.dryRun
        ? "On · practice (no orders)"
        : "On · real orders at Topstep";
  const takePayout = () => {
    const ask = prompt(`Payout taken from ${f.label}: how much did you request? It comes off the profit, the loss limit is fixed at $0, winning days restart, and the card switches back on.`, String(a.cfg.payoutAmount));
    if (ask === null) return;
    const amount = Number(ask.replace(/[^0-9.]/g, ""));
    if (!amount) return setMsg("Type the payout amount.");
    start(async () => {
      const r = await payoutTaken(a.id, amount);
      setMsg("error" in r && r.error ? r.error : "Payout booked. Trading on.");
      router.refresh();
    });
  };

  return (
    <div className={cn("border p-4", f.enabled ? (a.mode === "live" ? "border-neg/40" : "border-gold/40") : "border-line-2 opacity-90")}>
      <div className="flex items-center gap-3">
        <input className="field h-9 min-w-0 flex-1 font-mono text-[12px]" value={f.label} maxLength={60} aria-label="Card name" onChange={(e) => setF({ ...f, label: e.target.value })} onBlur={() => f.label !== init.label && save()} />
        <Toggle checked={f.enabled} label={`Trade ${f.label}`} onChange={(v) => set({ enabled: v })} />
      </div>
      <div className="mt-1.5 font-mono text-[10px] text-ink-4">
        {status}
        {a.payouts > 0 && ` · ${a.payouts} ${a.payouts === 1 ? "payout" : "payouts"} taken`}
      </div>
      {a.doneNote && <div className="mt-1 font-mono text-[10px] leading-[1.6] text-gold">{a.doneNote}</div>}
      {a.done === "payout" && (
        <button type="button" disabled={pending} onClick={takePayout} className="mt-2.5 w-full border border-gold/70 bg-gold/10 px-3 py-2.5 font-mono text-[10.5px] tracking-[0.2em] text-ink uppercase">
          Payout taken · carry on
        </button>
      )}

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-y border-line py-2.5 font-mono text-[10.5px] text-ink-3 sm:grid-cols-4">
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
          Left today <b className="font-normal text-ink">{money(Math.max(0, s.left))}</b>
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
        <span>
          Room <b className="font-normal text-ink">{money(s.room)}</b>
        </span>
      </div>
      <div className="mt-2 font-mono text-[10px] leading-[1.7] text-ink-4">
        Next C trade: <span className="text-ink-2">{s.next}</span>
      </div>

      <div className="mt-3">
        <span className={lab}>Firm</span>
        <div className="grid grid-cols-2 gap-2">
          {(["topstep", "lucid"] as const).map((fm) => (
            <button key={fm} type="button" disabled={pending} className={chip(f.firm === fm)} onClick={() => f.firm !== fm && confirm(`Change ${f.label} to ${fm === "lucid" ? "Lucid" : "Topstep"}? It starts at the first stage with that firm's tested settings.`) && set({ firm: fm, stage: "eval" })}>
              <span className="block text-[11px]">{fm === "topstep" ? "Topstep" : "Lucid (LucidMaxx)"}</span>
              <span className="mt-0.5 block text-[9.5px] text-ink-4">{fm === "topstep" ? "the bot places the orders" : "you place them: the bot tells you each trade"}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <span className={lab}>Stage</span>
        <div className="grid grid-cols-2 gap-2">
          {STAGES[f.firm].map(([st, name]) => (
            <button
              key={st}
              type="button"
              disabled={pending}
              className={chip(f.stage === st)}
              onClick={() => f.stage !== st && confirm(`Set ${f.label} to ${name}? It starts that stage from zero (profit, best day, winning days, loss limit), with that stage's own settings.`) && set({ stage: st })}
            >
              <span className="block text-[11px]">{name}</span>
              <span className="mt-0.5 block text-[9.5px] leading-[1.5] text-ink-4">
                {f.stage === st ? `${contracts} MNQ · ${stopPts} pt stop (${money(contracts * stopPts * 2)}) · ${money(Number(f.cfg.dayGoal) || 0)} day goal` : "its own size, stop, goal and switches"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <Group title="Size and stop" note={`${contracts} MNQ · ${stopPts} pt · ${money(contracts * stopPts * 2)} risk`} open>
          <div className="grid grid-cols-2 gap-3">
            {N({ k: "contracts", label: "Contracts (MNQ)", dec: false })}
            {N({ k: "stopPts", label: "Stop loss", suf: "points" })}
          </div>
          {T({ k: "sizeDown", children: <>Short of room: trade fewer contracts at the same stop (off = skip the trade)</> })}
        </Group>

        <Group title="Profit target" note={f.cfg.targetMode === "goal" ? "what's left of today's goal" : `fixed ${f.cfg.targetMode === "points" ? `${f.cfg.targetValue} pt` : `$${f.cfg.targetValue}`}`} open>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["goal", "Rest of today's goal"],
                ["points", "Fixed points"],
                ["dollars", "Fixed dollars"],
              ] as const
            ).map(([m, name]) => (
              <button key={m} type="button" className={pill(f.cfg.targetMode === m)} onClick={() => f.cfg.targetMode !== m && cfg({ targetMode: m })}>
                {name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {N({ k: "dayGoal", label: "Day goal", pre: "$" })}
            {f.cfg.targetMode !== "goal" && N({ k: "targetValue", label: f.cfg.targetMode === "points" ? "Target" : "Target (after costs)", pre: f.cfg.targetMode === "dollars" ? "$" : undefined, suf: f.cfg.targetMode === "points" ? "points" : undefined })}
            {N({ k: "minTarget", label: "Smallest target worth a trade", pre: "$" })}
          </div>
          {f.cfg.targetMode !== "goal" && T({ k: "capAtGoal", children: <>Never aim past what&apos;s left of today&apos;s goal</> })}
          {T({ k: "guard", children: <>Goal guard: your Mac checks this account&apos;s target order every few seconds and closes at market if price trades through it</> })}
        </Group>

        <Group title="Sessions and day limits" note={[f.cfg.asia && "Asia", f.cfg.lon && "London", f.cfg.ny && "New York"].filter(Boolean).join(" · ") || "no sessions"}>
          <div className="flex flex-wrap items-center gap-2">
            C trades
            {(
              [
                ["asia", "Asia 20:00"],
                ["lon", "London 03:30"],
                ["ny", "New York 10:10"],
              ] as const
            ).map(([k, name]) => (
              <button key={k} type="button" className={pill(f.cfg[k] as boolean)} onClick={() => cfg({ [k]: !f.cfg[k] })}>
                {name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {N({ k: "maxTradesDay", label: "Most trades a day", dec: false })}
            {N({ k: "stopAfterLosses", label: "Stop after losses", dec: false, suf: "0 = off" })}
            {N({ k: "dayLossStop", label: "Stop the day at −", pre: "$", blank: "off" })}
          </div>
        </Group>

        <Group title="SOR Safe add-on" note={f.cfg.sorOn ? `on · ${f.cfg.sorContracts} MNQ · ${[f.cfg.sorLon && "London", f.cfg.sorNyam && "NY AM"].filter(Boolean).join(" + ") || "no sessions"}` : "off"}>
          {T({ k: "sorOn", children: <>Take the session&apos;s first safe SOR signal (tested for Topstep evals only)</> })}
          {f.cfg.sorOn && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-28">
                  {N({ k: "sorContracts", label: "SOR contracts", dec: false })}
                </span>
                <button type="button" className={pill(f.cfg.sorLon as boolean)} onClick={() => cfg({ sorLon: !f.cfg.sorLon })}>
                  London (first 150 min)
                </button>
                <button type="button" className={pill(f.cfg.sorNyam as boolean)} onClick={() => cfg({ sorNyam: !f.cfg.sorNyam })}>
                  NY AM (first 90 min)
                </button>
              </div>
              {T({ k: "sorCapAtGoal", children: <>Cap SOR&apos;s target at what&apos;s left of today&apos;s goal</> })}
              {T({ k: "sorHalfStop", children: <>Skip when that capped reward is under half of SOR&apos;s stop</> })}
            </>
          )}
        </Group>

        <Group title="Account rules" note={funded ? `payout at ${money(Number(f.cfg.payoutBalance) || 0)}` : `pass at ${money(Number(f.cfg.passTarget) || 0)}`}>
          {!lucid && (
            <label className="flex items-center gap-2.5">
              <Toggle checked={f.dll} label="Bought with the daily loss limit" onChange={(v) => set({ dll: v })} />
              This account has a daily loss limit
            </label>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {N({ k: "mll", label: "Trailing max loss", pre: "$" })}
            {f.dll && !lucid && N({ k: "dllAmount", label: "Daily loss limit", pre: "$", blank: "none" })}
            {!funded && (
              <>
                {N({ k: "passTarget", label: "Profit to pass", pre: "$" })}
                {N({ k: "consistency", label: "Best day at most", suf: "%", blank: "no rule" })}
                {N({ k: "passMargin", label: "Aim past the line by", pre: "$" })}
              </>
            )}
            {funded && (
              <>
                {N({ k: "payoutBalance", label: "Payout at profit", pre: "$", blank: "never" })}
                {N({ k: "payoutAmount", label: "Payout you request", pre: "$" })}
                {N({ k: "winDaysNeeded", label: "Winning days needed", dec: false })}
                {N({ k: "winDay", label: "A winning day is", pre: "$", suf: "+" })}
              </>
            )}
          </div>
          {funded && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={pending} onClick={takePayout} className={pill(false)}>
                Payout taken…
              </button>
              <label className="flex items-center gap-2.5">
                <Toggle checked={f.floorLocked} label="Loss limit fixed at $0" onChange={(v) => set({ floorLocked: v })} />
                Loss limit fixed at $0 (after a payout)
              </label>
            </div>
          )}
        </Group>

        <Group title="Already traded this account before the bot?" note={Number(f.baseProfit) ? `starts at ${money(Number(f.baseProfit))}` : undefined}>
          <div className="grid grid-cols-3 gap-2">
            <label>
              <span className={lab}>Profit $</span>
              <input className={num} inputMode="decimal" value={f.baseProfit} onChange={(e) => setF({ ...f, baseProfit: e.target.value.replace(/[^0-9.-]/g, "") })} onBlur={() => f.baseProfit !== init.baseProfit && save()} />
            </label>
            <label>
              <span className={lab}>Best day $</span>
              <input className={num} inputMode="decimal" value={f.baseBest} onChange={(e) => setF({ ...f, baseBest: e.target.value.replace(/[^0-9.]/g, "") })} onBlur={() => f.baseBest !== init.baseBest && save()} />
            </label>
            <label>
              <span className={lab}>Winning days</span>
              <input className={num} inputMode="numeric" value={f.baseWinDays} onChange={(e) => setF({ ...f, baseWinDays: e.target.value.replace(/\D/g, "") })} onBlur={() => f.baseWinDays !== init.baseWinDays && save()} />
            </label>
          </div>
        </Group>
      </div>

      {!lucid && (
        <div className="border-t border-line pt-3">
          <label className="block">
            <span className={lab}>TopstepX account (name or ID)</span>
            <input className="field h-9 w-full font-mono text-[11.5px]" list="ltj-tsx" value={f.topstepAccount} maxLength={80} placeholder="e.g. 50KTC-V2-…" onChange={(e) => setF({ ...f, topstepAccount: e.target.value })} onBlur={() => f.topstepAccount !== init.topstepAccount && save()} />
            {f.topstepAccount.trim() && options.length > 0 && !options.some((o) => String(o.id) === f.topstepAccount.trim() || o.name.toLowerCase().includes(f.topstepAccount.trim().toLowerCase())) && (
              <span className="mt-1 block font-mono text-[10px] text-neg">No TopstepX account matches this.</span>
            )}
          </label>
          <span className={cn(lab, "mt-3")}>Orders</span>
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[10px] text-ink-4">
        <span>{pending ? "Saving…" : (msg ?? (a.changed.length ? <span className="text-gold">{a.changed.length} changed from the tested plan (in gold)</span> : "On the tested plan"))}</span>
        <span className="flex gap-4">
          {a.changed.length > 0 && (
            <button
              type="button"
              className="hover:text-ink"
              onClick={() =>
                confirm(`Put ${f.label}'s ${f.stage} settings back to the tested plan?`) &&
                start(async () => {
                  await resetPassSettings(a.id);
                  router.refresh();
                })
              }
            >
              Back to the tested plan
            </button>
          )}
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
        </span>
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
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {accounts.map((a) => (
          <Card key={`${a.id}-${a.stage}-${a.firm}-${a.enabled}-${a.done}-${a.payouts}-${JSON.stringify(a.cfg)}-${a.dll}-${a.floorLocked}`} a={a} options={options} />
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
