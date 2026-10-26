"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveInactivity } from "@/lib/actions/settings";
import { atRisk, describeSend, findAccount, idleDays, importId, newRule, sameFirm, watchList, type InactivityRule, type InactivitySettings, type WatchedAccount } from "@/lib/analytics/inactivity";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Seg } from "@/components/m/Seg";
import { cn } from "@/lib/cn";
import { MONTHS, WEEKDAYS, weekdayIndex } from "@/lib/analytics/time";
import { RemoveX, Sub } from "./ui";

const label = "mb-2 block font-mono text-[9.5px] tracking-[0.22em] text-ink-4 uppercase";
const num = "field num h-9 w-20 px-2 py-0 text-center";
// Built by hand so the server and the phone print exactly the same text.
const day = (d: string) => `${WEEKDAYS[weekdayIndex(d)]} ${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]!.slice(0, 3)}`;

function RuleCard({ r, set, remove, accounts, today }: { r: InactivityRule; set: (r: InactivityRule) => void; remove: () => void; accounts: WatchedAccount[]; today: string }) {
  const { held, risky } = atRisk({ ...r, enabled: true }, accounts, today);
  const n = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || min)));
  return (
    <div className={cn("border-b border-line py-5", !r.enabled && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-4">
        <input className="field h-9 w-48" value={r.firm} maxLength={40} list="ltj-firms" aria-label="Firm" placeholder="Firm, e.g. Tradeify" onChange={(e) => set({ ...r, firm: e.target.value })} />
        <Toggle checked={r.enabled} onChange={(v) => set({ ...r, enabled: v })} label={`Watch ${r.firm || "this firm"}`} />
        <span className="font-mono text-[10.5px] text-ink-4">
          {held} {held === 1 ? "account" : "accounts"} at this firm
          {held < r.minAccounts ? ` · switches on at ${r.minAccounts}` : risky.length ? ` · ${risky.length} running short` : " · all fine"}
        </span>
        <span className="ml-auto">
          <RemoveX onClick={remove} label={`Delete the ${r.firm} rule`} />
        </span>
      </div>
      <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <span className={label}>Closed after</span>
          <div className="flex items-center gap-3">
            <input className={num} inputMode="numeric" value={r.days} aria-label="Days" onChange={(e) => set({ ...r, days: n(e.target.value, 1, 365) })} />
            <Seg value={r.unit} onChange={(v) => set({ ...r, unit: v })} options={[{ value: "calendar", label: "Days" }, { value: "trading", label: "Trading days" }]} />
          </div>
        </div>
        <div>
          <span className={label}>Warn me when this many are left</span>
          <input className={num} inputMode="numeric" value={r.warnBefore} aria-label="Warn before" onChange={(e) => set({ ...r, warnBefore: n(e.target.value, 0, 60) })} />
        </div>
        <div>
          <span className={label}>Only when I hold at least</span>
          <div className="flex items-center gap-3">
            <input className={num} inputMode="numeric" value={r.minAccounts} aria-label="Minimum accounts" onChange={(e) => set({ ...r, minAccounts: n(e.target.value, 1, 50) })} />
            <span className="font-mono text-[11px] text-ink-3">accounts here</span>
          </div>
        </div>
        <div className="sm:col-span-2">
          <span className={label}>Send it</span>
          <div className="flex flex-wrap items-center gap-3">
            <Seg value={r.sendAt} onChange={(v) => set({ ...r, sendAt: v })} options={[{ value: "checkin", label: "With the 12:00 check-in" }, { value: "pre", label: "Before my window" }, { value: "time", label: "At a time" }]} />
            {r.sendAt === "time" && <input type="time" className="field num h-9 w-28 px-2 py-0" value={r.time} aria-label="Send time" onChange={(e) => e.target.value && set({ ...r, time: e.target.value })} />}
          </div>
        </div>
        <div>
          <span className={label}>Repeat</span>
          <Seg value={r.repeat} onChange={(v) => set({ ...r, repeat: v })} options={[{ value: "daily", label: "Daily until I trade" }, { value: "once", label: "Once" }]} />
        </div>
      </div>
      <p className="mt-3 font-mono text-[10.5px] leading-[1.8] text-ink-4">
        {r.firm || "This firm"} closes an account after {r.days} {r.unit === "trading" ? "trading days" : "days"} without a trade. You&apos;ll hear {describeSend(r)} once one is within {r.warnBefore}{" "}
        {r.warnBefore === 1 ? "day" : "days"} of that, {r.repeat === "daily" ? "every day until it trades" : "once per quiet spell"}, while you hold {r.minAccounts}+ accounts there.
      </p>
    </div>
  );
}

/** Per-firm inactivity rules and the accounts they watch. */
export function Inactivity({ initial, accounts: seen, today }: { initial: InactivitySettings; accounts: WatchedAccount[]; today: string }) {
  const [s, setS] = useState<InactivitySettings>(initial);
  const [status, setStatus] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus("Saving…");
    const t = setTimeout(async () => {
      const r = await saveInactivity(s);
      setStatus("error" in r && r.error ? r.error : "Saved");
    }, 600);
    return () => clearTimeout(t);
  }, [s]);

  // The watch list as you've set it here (unsaved changes included).
  const accounts = useMemo(() => watchList(seen, s), [seen, s]);
  const removed = seen.filter((a) => s.hidden.includes(a.id));
  const [add, setAdd] = useState({ name: "", firm: "", since: today });
  const [addNote, setAddNote] = useState("");

  const remove = (a: WatchedAccount) =>
    setS((x) => ({
      ...x,
      manual: x.manual.filter((m) => m.id !== a.id && findAccount(m.name, [a]) === undefined),
      hidden: seen.some((f) => f.id === a.id) ? [...new Set([...x.hidden, a.id])] : x.hidden,
    }));
  const restore = (id: string) => setS((x) => ({ ...x, hidden: x.hidden.filter((h) => h !== id) }));
  const addAccount = () => {
    const name = add.name.trim();
    if (!name) return setAddNote("Type the account name as your firm shows it.");
    const match = findAccount(name, seen);
    const id = match?.id ?? importId(name);
    setS((x) => ({
      ...x,
      hidden: x.hidden.filter((h) => h !== id),
      firmOf: add.firm.trim() ? { ...x.firmOf, [id]: add.firm.trim() } : x.firmOf,
      // A known account with trades needs nothing more; one without keeps your start date.
      manual: match?.lastTrade ? x.manual : [...x.manual.filter((m) => m.id !== id), { id, name: match?.name ?? name, since: add.since }],
    }));
    setAddNote(match ? `Found ${match.name} in your trades: it's back on the list.` : `Added. Imports under ${name} will join it.`);
    setAdd({ name: "", firm: add.firm, since: today });
  };
  const firms = [...new Set([...accounts.map((a) => a.firm).filter(Boolean), ...s.rules.map((r) => r.firm)])].sort();
  const setRule = (i: number, r: InactivityRule) => setS((x) => ({ ...x, rules: x.rules.map((y, j) => (j === i ? r : y)) }));
  const untracked = firms.filter((f) => !s.rules.some((r) => sameFirm(r.firm, f)));

  return (
    <div className="max-w-4xl">
      <datalist id="ltj-firms">
        {firms.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <Sub aside={<span className={cn("font-mono text-[10px]", status === "Saved" ? "text-pos" : "text-ink-4")}>{status || "Changes save as you go"}</span>}>Inactivity · a rule per firm</Sub>
      {s.rules.length === 0 && <p className="py-5 font-mono text-[11.5px] leading-[1.8] text-ink-3">No rules yet. Add one for each firm that closes quiet accounts, with that firm&apos;s own numbers.</p>}
      {s.rules.map((r, i) => (
        <RuleCard key={r.id} r={r} set={(x) => setRule(i, x)} remove={() => setS((x) => ({ ...x, rules: x.rules.filter((_, j) => j !== i) }))} accounts={accounts} today={today} />
      ))}
      <div className="mt-4 flex flex-wrap gap-3">
        {untracked.slice(0, 4).map((f) => (
          <Button key={f} variant="secondary" onClick={() => setS((x) => ({ ...x, rules: [...x.rules, newRule(f)] }))}>
            + Rule for {f}
          </Button>
        ))}
        <Button variant="secondary" onClick={() => setS((x) => ({ ...x, rules: [...x.rules, newRule("")] }))}>
          + Add a firm rule
        </Button>
      </div>

      <div className="mt-10">
        <Sub>Your accounts · {accounts.length}</Sub>
        {accounts.length === 0 ? (
          <p className="py-4 font-mono text-[11px] text-ink-3">No accounts on the list. Add one below, or they appear once a connection syncs or trades are imported.</p>
        ) : (
          <ul>
            {accounts.map((a) => {
              const rule = s.rules.find((r) => sameFirm(r.firm, a.firm));
              const idle = idleDays(a.lastTrade ?? a.since, today, rule?.unit ?? "calendar");
              const left = rule ? rule.days - idle : null;
              return (
                <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-line py-3 font-mono text-[11.5px] sm:grid-cols-[minmax(0,1fr)_11rem_auto_auto]">
                  <span className="break-all text-ink" title={a.id}>
                    {a.name}
                  </span>
                  <span className="justify-self-end sm:order-last">
                    <RemoveX onClick={() => remove(a)} label={`Take ${a.name} off the list`} />
                  </span>
                  <input
                    className="field h-8 px-2 py-0 text-[11px]"
                    list="ltj-firms"
                    value={s.firmOf[a.id] ?? a.firm}
                    maxLength={40}
                    placeholder="Which firm?"
                    aria-label={`Firm for ${a.name}`}
                    onChange={(e) => setS((x) => ({ ...x, firmOf: { ...x.firmOf, [a.id]: e.target.value } }))}
                  />
                  <span className={cn("text-right text-[10.5px]", left !== null && rule && left <= rule.warnBefore ? "text-gold" : "text-ink-4")}>
                    {a.lastTrade ? `last trade ${day(a.lastTrade)}` : `started ${day(a.since)}`}
                    {left !== null && ` · ${left <= 0 ? "past the limit" : `${left} left`}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 basis-40">
            <span className={label}>Add an account</span>
            <input className="field h-9 w-full" value={add.name} maxLength={80} placeholder="Name, e.g. TDFY1636638" onChange={(e) => setAdd({ ...add, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addAccount()} />
          </label>
          <label className="w-36">
            <span className={label}>Firm</span>
            <input className="field h-9 w-full" list="ltj-firms" value={add.firm} maxLength={40} placeholder="Tradeify" onChange={(e) => setAdd({ ...add, firm: e.target.value })} />
          </label>
          <label className="w-40">
            <span className={label}>Bought on</span>
            <input type="date" className="field num h-9 w-full px-2 py-0" value={add.since} max={today} onChange={(e) => e.target.value && setAdd({ ...add, since: e.target.value })} />
          </label>
          <Button variant="secondary" onClick={addAccount}>
            + Add account
          </Button>
        </div>
        {addNote && <p className="mt-2 font-mono text-[10.5px] text-ink-3">{addNote}</p>}
        {removed.length > 0 && (
          <details className="mt-5">
            <summary className="cursor-pointer font-mono text-[10.5px] text-ink-4">Removed · {removed.length} (trades and stats kept)</summary>
            <ul className="mt-2">
              {removed.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-4 border-b border-line py-2 font-mono text-[11px] text-ink-3">
                  <span className="break-all">{a.name}</span>
                  <button type="button" className="shrink-0 text-ink-4 underline-offset-4 hover:text-ink hover:underline" onClick={() => restore(a.id)}>
                    Put back
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="mt-3 font-mono text-[10.5px] leading-[1.8] text-ink-4">
          × only takes an account off this list; its trades and stats stay. Each account counts from its own last trade, or the day you bought it if it hasn&apos;t traded. Imported trades count once imported, synced ones about hourly.
        </p>
      </div>
    </div>
  );
}
