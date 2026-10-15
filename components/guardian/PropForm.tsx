"use client";

import { useState, useTransition } from "react";
import type { BrokerAccount, PropSettings } from "@/lib/types";
import { PROP_PRESETS } from "@/lib/analytics/prop";
import { FIRM_SUGGESTIONS } from "@/lib/analytics/ledger";
import { saveProp } from "@/lib/actions/settings";
import { Btn, Field, Panel } from "@/components/m";
import { Seg } from "@/components/m/Seg";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/cn";

const eyebrow = "mb-3 block font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase";

function NumField({
  label,
  value,
  onChange,
  nullable = false,
  prefix,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  nullable?: boolean;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <Field label={label}>
      <span className="relative block">
        {prefix && <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-mono text-[13px] text-ink-4">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          className={cn("field num", prefix && "!pl-7", suffix && "!pr-10")}
          value={value ?? ""}
          placeholder={nullable ? "off" : undefined}
          onChange={(e) => onChange(e.target.value === "" ? (nullable ? null : 0) : Number(e.target.value))}
        />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 font-mono text-[11px] text-ink-4">{suffix}</span>}
      </span>
    </Field>
  );
}

/** The account's rules, as the firm writes them: a calm form in a single panel. */
export function PropForm({ initial, accounts }: { initial: PropSettings; accounts: BrokerAccount[] }) {
  const [p, setP] = useState(initial);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, start] = useTransition();
  const set = (patch: Partial<PropSettings>) => {
    setState("idle");
    setP((c) => ({ ...c, ...patch }));
  };

  return (
    <Panel>
      <div className="flex items-start justify-between gap-6 border-b border-line pb-[clamp(1.8rem,4vh,2.4rem)]">
        <div>
          <p className="font-serif text-[clamp(1.4rem,2.6vw,1.9rem)] leading-[1.2] font-light tracking-[-0.01em] [&_em]:italic">
            Guardian is <em>{p.enabled ? "on" : "off"}</em>.
          </p>
          <p className="mt-2.5 max-w-[44ch] font-mono text-[11.5px] leading-[1.8] text-ink-3">
            {p.enabled ? "Replaying every day against these rules." : "Switch it on to track an evaluation or funded account live."}
          </p>
        </div>
        <div className="pt-2">
          <Toggle checked={p.enabled} onChange={(v) => set({ enabled: v })} label="Guardian tracking" />
        </div>
      </div>

      <div className="grid gap-x-7 gap-y-7 pt-[clamp(1.8rem,4vh,2.4rem)] sm:grid-cols-2">
        <div>
          <Field label="Firm">
            <input className="field" value={p.firm} maxLength={60} list="prop-firms" autoComplete="off" onChange={(e) => set({ firm: e.target.value })} />
          </Field>
          <datalist id="prop-firms">
            {FIRM_SUGGESTIONS.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </div>
        <Field label="Tracking from">
          <input type="date" className="field" value={p.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </Field>
      </div>

      <div className="mt-10 grid gap-x-7 gap-y-8 sm:grid-cols-2">
        <div>
          <span className={eyebrow}>Account size</span>
          <Seg
            value={p.preset}
            onChange={(v) => set(v === "custom" ? { preset: v } : { preset: v, ...PROP_PRESETS[v] })}
            options={[
              { value: "50K", label: "50K" },
              { value: "100K", label: "100K" },
              { value: "150K", label: "150K" },
              { value: "custom", label: "Custom" },
            ]}
          />
        </div>
        <div>
          <span className={eyebrow}>Phase</span>
          <Seg
            value={p.phase}
            onChange={(v) =>
              set({ phase: v, profitTarget: v === "funded" ? null : p.preset !== "custom" ? PROP_PRESETS[p.preset].profitTarget : (p.profitTarget ?? 3000) })
            }
            options={[
              { value: "combine", label: "Combine" },
              { value: "funded", label: "Funded" },
            ]}
          />
        </div>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-7 lg:grid-cols-3">
        <NumField label="Starting balance" prefix="$" value={p.startBalance} onChange={(v) => set({ startBalance: v ?? 0, preset: "custom" })} />
        <NumField label="Profit target" prefix="$" value={p.profitTarget} nullable onChange={(v) => set({ profitTarget: v, preset: "custom" })} />
        <NumField label="Max loss · trailing" prefix="$" value={p.maxLossLimit} onChange={(v) => set({ maxLossLimit: v ?? 0, preset: "custom" })} />
        <NumField label="Daily loss limit" prefix="$" value={p.dailyLossLimit} nullable onChange={(v) => set({ dailyLossLimit: v, preset: "custom" })} />
        <NumField label="Best day ≤" suffix="%" value={p.consistencyPct} nullable onChange={(v) => set({ consistencyPct: v, preset: "custom" })} />
        <NumField label="Max contracts" suffix="mini" value={p.maxContracts} nullable onChange={(v) => set({ maxContracts: v, preset: "custom" })} />
      </div>

      {accounts.length > 0 && (
        <div className="mt-10">
          <span className={eyebrow}>Accounts to track · none selected = all</span>
          <div className="flex flex-wrap gap-2.5">
            {accounts.map((a) => {
              const on = p.accountIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ accountIds: on ? p.accountIds.filter((x) => x !== a.id) : [...p.accountIds, a.id] })}
                  className={cn(
                    "inline-flex h-9 items-center gap-2.5 rounded-[2px] border px-3.5 font-mono text-[10px] tracking-[0.16em] uppercase transition-colors duration-300",
                    on ? "border-ink-3 text-ink" : "border-line text-ink-3 hover:border-line-2 hover:text-ink-2",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full transition-colors duration-300", on ? "bg-pos" : "bg-ink-4")} aria-hidden />
                  {a.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-10 max-w-[64ch] font-mono text-[11px] leading-[1.85] text-ink-4">
        Presets follow Topstep&apos;s published Combine rules: an end-of-day trailing max loss that locks at your starting balance, and a 50%
        consistency target. Firms change their rules — check them against your dashboard.
      </p>

      <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
        <Btn
          variant="primary"
          size="lg"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                await saveProp(p);
                setState("saved");
              } catch {
                setState("error");
              }
            })
          }
        >
          {pending ? "Saving…" : "Save the rules"}
        </Btn>
        <span aria-live="polite" className={cn("font-mono text-[10.5px] tracking-[0.08em]", state === "saved" ? "text-pos" : "text-neg")}>
          {state === "saved" ? "● Saved — Guardian is watching" : state === "error" ? "— Couldn't save. Check the numbers." : ""}
        </span>
      </div>
    </Panel>
  );
}
