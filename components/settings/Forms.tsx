"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Plus, X } from "lucide-react";
import type { RitualItem, Settings, TradingRules } from "@/lib/types";
import { saveProfile, saveRitual, saveRules, saveVocab, setAiEnabled } from "@/lib/actions/settings";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Segmented } from "@/components/ui/Segmented";

function SaveButton({ pending, saved, onClick }: { pending: boolean; saved: boolean; onClick: () => void }) {
  return (
    <Button variant="primary" size="md" onClick={onClick} disabled={pending}>
      {pending ? <LoaderCircle size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null} {saved ? "Saved" : "Save"}
    </Button>
  );
}

function useSaver<T>(fn: (v: T) => Promise<unknown>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return {
    pending,
    saved,
    dirty: () => setSaved(false),
    save: (v: T) =>
      start(async () => {
        await fn(v);
        setSaved(true);
        router.refresh();
      }),
  };
}

function Num({ label, hint, value, onChange, prefix }: { label: string; hint?: string; value: number | null; onChange: (v: number | null) => void; prefix?: string }) {
  return (
    <label className="flex items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-[14px]">{label}</span>
        {hint && <span className="block text-[12px] text-ink-3">{hint}</span>}
      </span>
      <span className="relative w-32 shrink-0">
        {prefix && <span className="absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-ink-3">{prefix}</span>}
        <input
          type="number"
          min="0"
          value={value ?? ""}
          placeholder="off"
          onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
          className={`field h-10 text-right ${prefix ? "pl-6" : ""}`}
        />
      </span>
    </label>
  );
}

export function RulesForm({ initial }: { initial: TradingRules }) {
  const [r, setR] = useState(initial);
  const s = useSaver(saveRules);
  const set = (p: Partial<TradingRules>) => {
    s.dirty();
    setR((c) => ({ ...c, ...p }));
  };
  const [draft, setDraft] = useState("");
  return (
    <div>
      <p className="mb-2 text-[13px] leading-relaxed text-ink-3">
        These are enforced automatically against every synced trade — your Discipline ring, report card and Rule Lab all use them.
      </p>
      <div className="divide-y divide-line">
        <Num label="Max trades per day" value={r.maxTradesPerDay} onChange={(v) => set({ maxTradesPerDay: v })} />
        <Num label="Daily loss limit" prefix="$" value={r.maxDailyLoss} onChange={(v) => set({ maxDailyLoss: v })} />
        <Num label="Stop after losses in a row" value={r.stopAfterConsecutiveLosses} onChange={(v) => set({ stopAfterConsecutiveLosses: v })} />
        <Num label="Max contracts" value={r.maxContracts} onChange={(v) => set({ maxContracts: v })} />
        <Num label="Max loss per trade" prefix="$" value={r.maxLossPerTrade} onChange={(v) => set({ maxLossPerTrade: v })} />
        <Num label="Cool-down after a loss" hint="minutes before the next entry" value={r.cooldownMinutesAfterLoss} onChange={(v) => set({ cooldownMinutesAfterLoss: v })} />
        <Num label="Default risk per trade" hint="used for R-multiples" prefix="$" value={r.defaultRisk} onChange={(v) => set({ defaultRisk: v })} />
        <div className="flex items-center justify-between gap-4 py-3">
          <span className="text-[14px]">Trading window</span>
          <span className="flex items-center gap-2">
            <input type="time" value={r.sessionStart ?? ""} onChange={(e) => set({ sessionStart: e.target.value || null })} className="field h-10 w-[112px]" />
            <span className="text-ink-3">–</span>
            <input type="time" value={r.sessionEnd ?? ""} onChange={(e) => set({ sessionEnd: e.target.value || null })} className="field h-10 w-[112px]" />
          </span>
        </div>
      </div>
      <div className="mt-4">
        <div className="eyebrow mb-2">Personal rules (checked off in your journal)</div>
        <div className="space-y-2">
          {r.custom.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-[3px] border border-line bg-fill px-4 py-2.5">
              <span className="flex-1 text-[14px]">{c.label}</span>
              <button onClick={() => set({ custom: r.custom.filter((x) => x.id !== c.id) })} className="text-ink-4 hover:text-ink" aria-label="Remove">
                <X size={15} />
              </button>
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              set({ custom: [...r.custom, { id: Math.random().toString(36).slice(2, 10), label: draft.trim() }] });
              setDraft("");
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. No trades in the first 5 minutes" className="field h-10" maxLength={160} />
            <Button type="submit" size="md" variant="secondary">
              <Plus size={15} />
            </Button>
          </form>
        </div>
      </div>
      <div className="mt-5">
        <SaveButton pending={s.pending} saved={s.saved} onClick={() => s.save(r)} />
      </div>
    </div>
  );
}

export function RitualEditor({ initial }: { initial: RitualItem[] }) {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  const [group, setGroup] = useState<RitualItem["group"]>("pre");
  const s = useSaver(saveRitual);
  const update = (next: RitualItem[]) => {
    s.dirty();
    setItems(next);
  };
  const groups: { key: RitualItem["group"]; label: string }[] = [
    { key: "pre", label: "Pre-market" },
    { key: "post", label: "Post-session" },
    { key: "life", label: "Life" },
  ];
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="eyebrow mb-2">{g.label}</div>
          <div className="space-y-1.5">
            {items
              .filter((i) => i.group === g.key)
              .map((i) => (
                <div key={i.id} className="flex items-center gap-2 rounded-[3px] border border-line bg-fill px-4 py-2">
                  <input
                    value={i.label}
                    onChange={(e) => update(items.map((x) => (x.id === i.id ? { ...x, label: e.target.value } : x)))}
                    className="flex-1 bg-transparent text-[14px] focus:outline-none"
                    maxLength={160}
                  />
                  <button onClick={() => update(items.filter((x) => x.id !== i.id))} className="text-ink-4 hover:text-ink" aria-label="Remove">
                    <X size={15} />
                  </button>
                </div>
              ))}
          </div>
        </div>
      ))}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          update([...items, { id: Math.random().toString(36).slice(2, 10), label: draft.trim(), group }]);
          setDraft("");
        }}
      >
        <Segmented size="sm" value={group} onChange={setGroup} options={groups.map((g) => ({ value: g.key, label: g.label }))} />
        <div className="flex min-w-[220px] flex-1 gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a ritual item…" className="field h-10" maxLength={160} />
          <Button type="submit" variant="secondary">
            <Plus size={15} />
          </Button>
        </div>
      </form>
      <SaveButton pending={s.pending} saved={s.saved} onClick={() => s.save(items.filter((i) => i.label.trim()))} />
    </div>
  );
}

function TagList({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div>
      <div className="eyebrow mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-fill pr-2 pl-3 text-[13px]">
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))} className="text-ink-4 hover:text-ink" aria-label={`Remove ${v}`}>
              <X size={13} />
            </button>
          </span>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = draft.trim();
            if (v && !values.includes(v)) onChange([...values, v]);
            setDraft("");
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="+ add" className="h-8 w-28 rounded-full border border-dashed border-line-2 bg-transparent px-3 text-[13px] focus:outline-none" maxLength={60} />
        </form>
      </div>
    </div>
  );
}

export function VocabEditor({ initial }: { initial: Settings["vocab"] }) {
  const [v, setV] = useState(initial);
  const s = useSaver(saveVocab);
  const set = (p: Partial<Settings["vocab"]>) => {
    s.dirty();
    setV((c) => ({ ...c, ...p }));
  };
  return (
    <div className="space-y-5">
      <TagList label="Setups" values={v.setups} onChange={(x) => set({ setups: x })} />
      <TagList label="Mistakes" values={v.mistakes} onChange={(x) => set({ mistakes: x })} />
      <TagList label="Emotions" values={v.emotions} onChange={(x) => set({ emotions: x })} />
      <SaveButton pending={s.pending} saved={s.saved} onClick={() => s.save(v)} />
    </div>
  );
}

export function ProfileForm({ initial }: { initial: Settings["profile"] }) {
  const [p, setP] = useState(initial);
  const s = useSaver(saveProfile);
  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch {
      return ["America/New_York", "America/Chicago", "Europe/London", "UTC"];
    }
  }, []);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-[12.5px] text-ink-3">What should the app call you?</span>
          <input
            value={p.name}
            maxLength={60}
            onChange={(e) => {
              s.dirty();
              setP({ ...p, name: e.target.value });
            }}
            className="field"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[12.5px] text-ink-3">Timezone (defines your trading day)</span>
          <select
            value={p.timezone}
            onChange={(e) => {
              s.dirty();
              setP({ ...p, timezone: e.target.value });
            }}
            className="field"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
      </div>
      <SaveButton pending={s.pending} saved={s.saved} onClick={() => s.save({ ...p, name: p.name.trim() || "Lord Thundercunt" })} />
    </div>
  );
}

export function AiToggle({ enabled, configured, model }: { enabled: boolean; configured: boolean; model: string }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[14.5px] font-semibold">{configured ? `Claude is connected (${model})` : "No AI key yet"}</div>
          <div className="text-[12.5px] leading-relaxed text-ink-3">
            {configured
              ? "Briefings, reflections and the coach send summarised stats and your journal text to Anthropic's API. Credentials and account numbers are never sent."
              : "Add ANTHROPIC_API_KEY in Vercel to enable AI briefings, journal reflections and the coach."}
          </div>
        </div>
        <Toggle
          checked={on && configured}
          disabled={!configured}
          onChange={(v) => {
            setOn(v);
            start(async () => {
              await setAiEnabled(v);
              router.refresh();
            });
          }}
          label="AI enabled"
        />
      </div>
    </div>
  );
}
