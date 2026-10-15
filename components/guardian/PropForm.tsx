"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { BrokerAccount, PropSettings } from "@/lib/types";
import { PROP_PRESETS } from "@/lib/analytics/prop";
import { saveProp } from "@/lib/actions/settings";
import { Segmented } from "@/components/ui/Segmented";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";

function NumField({ label, value, onChange, nullable = false, hint }: { label: string; value: number | null; onChange: (v: number | null) => void; nullable?: boolean; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12.5px] text-ink-3">{label}</span>
      <input
        type="number"
        className="field"
        value={value ?? ""}
        placeholder={nullable ? "off" : undefined}
        onChange={(e) => onChange(e.target.value === "" ? (nullable ? null : 0) : Number(e.target.value))}
      />
      {hint && <span className="text-[11.5px] text-ink-4">{hint}</span>}
    </label>
  );
}

export function PropForm({ initial, accounts }: { initial: PropSettings; accounts: BrokerAccount[] }) {
  const [p, setP] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (patch: Partial<PropSettings>) => {
    setSaved(false);
    setP((c) => ({ ...c, ...patch }));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-[3px] border border-line bg-fill px-4 py-3">
        <div>
          <div className="text-[14.5px] font-semibold">Guardian is {p.enabled ? "on" : "off"}</div>
          <div className="text-[12.5px] text-ink-3">Tracks your evaluation or funded account rules live.</div>
        </div>
        <Toggle checked={p.enabled} onChange={(v) => set({ enabled: v })} label="Enable Guardian" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-[12.5px] text-ink-3">Firm</span>
          <input className="field" value={p.firm} onChange={(e) => set({ firm: e.target.value })} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[12.5px] text-ink-3">Tracking from</span>
          <input type="date" className="field" value={p.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={p.preset}
          onChange={(v) => set(v === "custom" ? { preset: v } : { preset: v, ...PROP_PRESETS[v] })}
          options={[{ value: "50K", label: "50K" }, { value: "100K", label: "100K" }, { value: "150K", label: "150K" }, { value: "custom", label: "Custom" }]}
        />
        <Segmented
          value={p.phase}
          onChange={(v) => set({ phase: v, profitTarget: v === "funded" ? null : (p.preset !== "custom" ? PROP_PRESETS[p.preset].profitTarget : p.profitTarget ?? 3000) })}
          options={[{ value: "combine", label: "Combine" }, { value: "funded", label: "Funded" }]}
        />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <NumField label="Starting balance" value={p.startBalance} onChange={(v) => set({ startBalance: v ?? 0, preset: "custom" })} />
        <NumField label="Profit target" value={p.profitTarget} nullable onChange={(v) => set({ profitTarget: v, preset: "custom" })} />
        <NumField label="Max loss limit (trailing)" value={p.maxLossLimit} onChange={(v) => set({ maxLossLimit: v ?? 0, preset: "custom" })} />
        <NumField label="Daily loss limit" value={p.dailyLossLimit} nullable onChange={(v) => set({ dailyLossLimit: v, preset: "custom" })} />
        <NumField label="Consistency (best day ≤ %)" value={p.consistencyPct} nullable onChange={(v) => set({ consistencyPct: v, preset: "custom" })} />
        <NumField label="Max contracts (minis)" value={p.maxContracts} nullable onChange={(v) => set({ maxContracts: v, preset: "custom" })} />
      </div>
      {accounts.length > 0 && (
        <div>
          <div className="mb-2 text-[12.5px] text-ink-3">Accounts to track (none selected = all)</div>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => {
              const on = p.accountIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => set({ accountIds: on ? p.accountIds.filter((x) => x !== a.id) : [...p.accountIds, a.id] })}
                  className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium ${on ? "border-transparent bg-ink text-bg" : "border-line bg-fill text-ink-2"}`}
                >
                  {a.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-[12px] leading-relaxed text-ink-4">
        Presets reflect Topstep&apos;s published Combine rules (end-of-day trailing max loss that locks at your starting balance, 50% consistency
        target). Firms change their rules — double-check against your dashboard.
      </p>
      <Button
        variant="primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await saveProp(p);
            setSaved(true);
          })
        }
      >
        {pending ? <LoaderCircle size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null} {saved ? "Saved" : "Save rules"}
      </Button>
    </div>
  );
}
