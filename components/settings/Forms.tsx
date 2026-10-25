"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RitualItem, Settings, TradingRules } from "@/lib/types";
import { saveProfile, saveRitual, saveRules, saveVocab, setAiEnabled } from "@/lib/actions/settings";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Seg } from "@/components/m/Seg";
import { lineInput, Note, RemoveX, SRow, Sub } from "./ui";

function SaveButton({ pending, saved, onClick }: { pending: boolean; saved: boolean; onClick: () => void }) {
  return (
    <div className="mt-8 flex items-center gap-5">
      <Button variant="primary" onClick={onClick} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {saved && <Note tone="pos">● Saved</Note>}
    </div>
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

const numInput = "w-28 border-0 border-b border-line-2 bg-transparent py-1.5 text-right font-mono text-[12.5px] text-ink outline-none transition-colors duration-300 placeholder:text-ink-4 focus:border-gold";

function NumRow({ label, hint, value, onChange, prefix }: { label: string; hint?: string; value: number | null; onChange: (v: number | null) => void; prefix?: string }) {
  return (
    <SRow name={label} hint={hint}>
      <label className="flex items-baseline gap-1.5">
        {prefix && <span className="font-mono text-[11px] text-ink-4">{prefix}</span>}
        <input
          type="number"
          min="0"
          inputMode="decimal"
          aria-label={label}
          value={value ?? ""}
          placeholder="off"
          onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
          className={numInput}
        />
      </label>
    </SRow>
  );
}

export function RulesForm({ initial, windowNote }: { initial: TradingRules; windowNote?: string | null }) {
  const [r, setR] = useState(initial);
  const s = useSaver(saveRules);
  const set = (p: Partial<TradingRules>) => {
    s.dirty();
    setR((c) => ({ ...c, ...p }));
  };
  const [draft, setDraft] = useState("");
  return (
    <div className="grid gap-x-[clamp(3rem,6vw,6rem)] gap-y-12 lg:grid-cols-2">
      <div>
        <Sub>Enforced on every trade</Sub>
        <NumRow label="Max trades a day" value={r.maxTradesPerDay} onChange={(v) => set({ maxTradesPerDay: v })} />
        <NumRow label="Daily loss limit" prefix="$" value={r.maxDailyLoss} onChange={(v) => set({ maxDailyLoss: v })} />
        <NumRow label="Stop after losses in a row" value={r.stopAfterConsecutiveLosses} onChange={(v) => set({ stopAfterConsecutiveLosses: v })} />
        <NumRow label="Max contracts" value={r.maxContracts} onChange={(v) => set({ maxContracts: v })} />
        <NumRow label="Max loss per trade" prefix="$" value={r.maxLossPerTrade} onChange={(v) => set({ maxLossPerTrade: v })} />
        <NumRow label="Cool-down after a loss" hint="Minutes before the next entry." value={r.cooldownMinutesAfterLoss} onChange={(v) => set({ cooldownMinutesAfterLoss: v })} />
        <NumRow label="Risk per trade" hint="Used for R-multiples." prefix="$" value={r.defaultRisk} onChange={(v) => set({ defaultRisk: v })} />
        <SRow name="Trading window">
          <span className="flex items-baseline gap-3">
            <input type="time" aria-label="Window opens" value={r.sessionStart ?? ""} onChange={(e) => set({ sessionStart: e.target.value || null })} className={`${numInput} w-[92px] text-left`} />
            <span className="font-mono text-ink-4">→</span>
            <input type="time" aria-label="Window closes" value={r.sessionEnd ?? ""} onChange={(e) => set({ sessionEnd: e.target.value || null })} className={`${numInput} w-[92px] text-left`} />
          </span>
        </SRow>
        <SRow
          name="Move my window when UK and US clocks differ"
          hint={
            <>
              Your times stay in your own time. The UK and US change their clocks on different weekends, so for a few weeks a year New York&apos;s 09:30 open lands an hour
              earlier on your clock. On, your window moves by that hour on those weeks only (14:30–16:00 becomes 13:30–15:00) for goals, alerts, reminders and the widget.
              {windowNote && r.followMarket && <span className="mt-1 block text-gold">◆ {windowNote}</span>}
            </>
          }
        >
          <Toggle checked={r.followMarket === true} onChange={(v) => set({ followMarket: v })} label="Move my window when UK and US clocks differ" />
        </SRow>
      </div>
      <div>
        <Sub>Only you can judge · ticked in the journal</Sub>
        {r.custom.map((c, i) => (
          <div key={c.id} className="flex items-center gap-4 border-b border-line py-3.5">
            <span className="font-mono text-[10.5px] text-gold">{String(i + 1).padStart(2, "0")}</span>
            <span className="flex-1 font-serif text-[1.1rem] font-light">{c.label}</span>
            <RemoveX onClick={() => set({ custom: r.custom.filter((x) => x.id !== c.id) })} label={`Remove ${c.label}`} />
          </div>
        ))}
        <form
          className="flex items-end gap-3 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            set({ custom: [...r.custom, { id: Math.random().toString(36).slice(2, 10), label: draft.trim() }] });
            setDraft("");
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="No trades in the first five minutes…" aria-label="New personal rule" className={lineInput} maxLength={160} />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
        <SaveButton pending={s.pending} saved={s.saved} onClick={() => s.save(r)} />
      </div>
    </div>
  );
}

const GROUPS: { key: RitualItem["group"]; label: string }[] = [
  { key: "pre", label: "Before the open" },
  { key: "post", label: "After the close" },
  { key: "life", label: "Life" },
];

export function RitualEditor({ initial }: { initial: RitualItem[] }) {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  const [group, setGroup] = useState<RitualItem["group"]>("pre");
  const s = useSaver(saveRitual);
  const update = (next: RitualItem[]) => {
    s.dirty();
    setItems(next);
  };
  let n = 0;
  return (
    <div>
      <div className="grid gap-x-[clamp(2rem,5vw,4rem)] gap-y-10 lg:grid-cols-3">
        {GROUPS.map((g) => {
          const list = items.filter((i) => i.group === g.key);
          return (
            <div key={g.key}>
              <Sub aside={<span className="num font-mono text-[10px] text-ink-4">{list.length}</span>}>{g.label}</Sub>
              {list.map((i) => (
                <div key={i.id} className="flex items-center gap-3 border-b border-line py-2.5">
                  <span className="font-mono text-[10px] text-gold">{String(++n).padStart(2, "0")}</span>
                  <input
                    value={i.label}
                    aria-label="Ritual item"
                    onChange={(e) => update(items.map((x) => (x.id === i.id ? { ...x, label: e.target.value } : x)))}
                    className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-ink-2 outline-none focus:text-ink"
                    maxLength={160}
                  />
                  <RemoveX onClick={() => update(items.filter((x) => x.id !== i.id))} label={`Remove ${i.label}`} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <form
        className="mt-10 flex flex-wrap items-end gap-x-6 gap-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          update([...items, { id: Math.random().toString(36).slice(2, 10), label: draft.trim(), group }]);
          setDraft("");
        }}
      >
        <Seg value={group} onChange={setGroup} options={GROUPS.map((g) => ({ value: g.key, label: g.label }))} />
        <div className="flex min-w-[240px] flex-1 items-end gap-3">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a ritual item…" aria-label="New ritual item" className={lineInput} maxLength={160} />
          <Button type="submit" size="sm">
            Add
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
      <Sub aside={<span className="num font-mono text-[10px] text-ink-4">{values.length}</span>}>{label}</Sub>
      <div className="flex flex-wrap items-center gap-2 pt-4">
        {values.map((v) => (
          <span key={v} className="inline-flex h-7 items-center gap-1 border border-line pr-0.5 pl-2.5 font-mono text-[10.5px] tracking-[0.06em] text-ink-2">
            {v}
            <RemoveX onClick={() => onChange(values.filter((x) => x !== v))} label={`Remove ${v}`} />
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
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="+ add" aria-label={`Add to ${label}`} className="h-7 w-28 border border-dashed border-line-2 bg-transparent px-2.5 font-mono text-[10.5px] text-ink outline-none placeholder:text-ink-4 focus:border-gold" maxLength={60} />
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
    <div>
      <div className="grid gap-x-[clamp(2rem,5vw,4rem)] gap-y-10 lg:grid-cols-3">
        <TagList label="Setups" values={v.setups} onChange={(x) => set({ setups: x })} />
        <TagList label="Mistakes" values={v.mistakes} onChange={(x) => set({ mistakes: x })} />
        <TagList label="Emotions" values={v.emotions} onChange={(x) => set({ emotions: x })} />
      </div>
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
    <div className="max-w-2xl">
      <SRow name="What should it call you?" hint="Used in greetings, and in the third person on the Observer page." stack>
        <input
          value={p.name}
          maxLength={60}
          aria-label="Name"
          onChange={(e) => {
            s.dirty();
            setP({ ...p, name: e.target.value });
          }}
          className="w-full border-0 border-b border-line-2 bg-transparent pb-2 font-serif text-[clamp(1.4rem,2.6vw,1.9rem)] font-light text-ink outline-none focus:border-gold"
        />
      </SRow>
      <SRow name="Timezone" hint="Defines where your trading day starts and ends.">
        <select
          value={p.timezone}
          aria-label="Timezone"
          onChange={(e) => {
            s.dirty();
            setP({ ...p, timezone: e.target.value });
          }}
          className="field h-9 w-64 py-0 text-[11.5px]"
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </SRow>
      <SaveButton pending={s.pending} saved={s.saved} onClick={() => s.save({ ...p, name: p.name.trim() || "Lord Thundercunt" })} />
    </div>
  );
}

export function AiToggle({ enabled, configured, model }: { enabled: boolean; configured: boolean; model: string }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [, start] = useTransition();
  return (
    <div className="max-w-2xl">
      <SRow
        name={configured ? <>Claude is connected <span className="text-ink-4">· {model}</span></> : "No AI key yet"}
        hint={
          configured
            ? "Replays, reflections, the Observer and the coach send summarised stats and your journal text to Anthropic's API. Credentials and account numbers are never sent."
            : "Add ANTHROPIC_API_KEY in Vercel to switch on AI replays, reflections, the Observer's voice and the coach."
        }
      >
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
      </SRow>
    </div>
  );
}
