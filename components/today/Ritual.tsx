"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { saveJournal, toggleChecklistItem } from "@/lib/actions/journal";
import type { DayTask, RitualItem } from "@/lib/types";

const GROUPS: { key: RitualItem["group"]; label: string; color: string }[] = [
  { key: "pre", label: "Before the open", color: "var(--pos)" },
  { key: "post", label: "After the close", color: "var(--pos)" },
  { key: "life", label: "Life", color: "var(--pos)" },
];

function CheckRow({ done, label, color, onToggle, onDelete }: { done: boolean; label: string; color: string; onToggle: () => void; onDelete?: () => void }) {
  return (
    <motion.div layout className="group flex items-center gap-3.5 py-2.5">
      <button
        onClick={onToggle}
        aria-pressed={done}
        className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border transition-all duration-300 active:scale-90"
        style={{ borderColor: done ? color : "var(--ink-4)", background: done ? color : "transparent", boxShadow: done ? "0 0 0 4px color-mix(in oklab, var(--glow) 18%, transparent)" : undefined }}
      >
        <AnimatePresence>
          {done && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 600, damping: 25 }}>
              <Check size={13} strokeWidth={2.6} className="text-on-brand" style={{ strokeWidth: 2.6 }} />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <button onClick={onToggle} className={cn("min-w-0 flex-1 text-left text-[15px] transition-colors duration-300", done ? "text-ink-3 line-through decoration-ink-4" : "text-ink")}>
        {label}
      </button>
      {onDelete && (
        <button onClick={onDelete} className="text-ink-4 opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink-2 max-sm:opacity-100" aria-label="Remove">
          <X size={15} />
        </button>
      )}
    </motion.div>
  );
}

export function Ritual({ day, items, checklist, tasks: initialTasks }: { day: string; items: RitualItem[]; checklist: Record<string, boolean>; tasks: DayTask[] }) {
  const [checked, setChecked] = useState(checklist);
  const [tasks, setTasks] = useState(initialTasks);
  const [draft, setDraft] = useState("");
  const [, start] = useTransition();

  const toggle = (id: string) => {
    const next = !checked[id];
    setChecked((c) => ({ ...c, [id]: next }));
    start(async () => {
      try {
        await toggleChecklistItem(day, id, next);
      } catch {
        setChecked((c) => ({ ...c, [id]: !next }));
      }
    });
  };

  const persistTasks = (next: DayTask[]) => {
    setTasks(next);
    start(async () => {
      await saveJournal(day, { tasks: next });
    });
  };

  const addTask = () => {
    const label = draft.trim();
    if (!label) return;
    setDraft("");
    persistTasks([...tasks, { id: Math.random().toString(36).slice(2, 10), label, done: false }]);
  };

  const total = items.length + tasks.length;
  const done = items.filter((i) => checked[i.id]).length + tasks.filter((t) => t.done).length;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-fill-3">
          <motion.div
            className="h-full rounded-full bg-pos"
            animate={{ width: `${total ? (done / total) * 100 : 0}%` }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <span className="num text-[12.5px] text-ink-2">
          {done}/{total}
        </span>
      </div>
      <div className="space-y-7">
        {GROUPS.map((g) => {
          const list = items.filter((i) => i.group === g.key);
          if (!list.length) return null;
          return (
            <div key={g.key}>
              <div className="eyebrow mb-1">{g.label}</div>
              <div className="divide-y divide-line">
                {list.map((i) => (
                  <CheckRow key={i.id} done={!!checked[i.id]} label={i.label} color={g.color} onToggle={() => toggle(i.id)} />
                ))}
              </div>
            </div>
          );
        })}
        <div>
          <div className="eyebrow mb-1">Today&apos;s to-dos</div>
          <div className="divide-y divide-line">
            {tasks.map((t) => (
              <CheckRow
                key={t.id}
                done={t.done}
                label={t.label}
                color="var(--pos)"
                onToggle={() => persistTasks(tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
                onDelete={() => persistTasks(tasks.filter((x) => x.id !== t.id))}
              />
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addTask();
            }}
            className="mt-2 flex items-center gap-2"
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add something for today…" className="field h-10 text-[14px]" maxLength={200} />
            <button type="submit" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line-2 text-ink-2 transition-colors hover:text-ink" aria-label="Add">
              <Plus size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
