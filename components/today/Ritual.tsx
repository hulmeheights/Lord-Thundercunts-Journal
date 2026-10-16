"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { saveJournal, toggleChecklistItem } from "@/lib/actions/journal";
import type { DayTask, RitualItem } from "@/lib/types";
import { Aside, GroupHead, Split } from "./Layout";
import { Rise } from "./Rise";

const GROUPS: { key: RitualItem["group"]; label: string }[] = [
  { key: "pre", label: "Before the open" },
  { key: "post", label: "After the close" },
  { key: "life", label: "Life" },
];

const EASE = "cubic-bezier(0.16,1,0.3,1)";

/** A square hairline box that fills jade and draws its tick. */
export function CheckBox({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[2px] border transition-[background-color,border-color] duration-300",
        on ? "border-pos bg-pos" : "border-line-2 group-hover:border-ink-4",
      )}
    >
      <svg viewBox="0 0 12 12" className="h-[11px] w-[11px]">
        <path
          d="M2.4 6.3 L4.9 8.7 L9.7 3.5"
          fill="none"
          stroke="var(--bg)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          style={{ strokeDashoffset: on ? 0 : 1, transition: `stroke-dashoffset 0.5s ${EASE} ${on ? "0.1s" : "0s"}` }}
        />
      </svg>
    </span>
  );
}

function CheckRow({ i, done, label, onToggle, onDelete }: { i: number; done: boolean; label: string; onToggle: () => void; onDelete?: () => void }) {
  return (
    <div className="m-row group grid grid-cols-[2.2rem_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:gap-x-4">
      <span className={cn("font-mono text-[11px] tracking-[0.1em] transition-colors duration-500", done ? "text-gold/45" : "text-gold")}>{String(i).padStart(2, "0")}</span>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        onClick={onToggle}
        className={cn(
          "min-w-0 py-[1.05rem] text-left font-mono text-[12.5px] leading-[1.6] tracking-[0.03em] transition-colors duration-500",
          done ? "text-ink-4 line-through decoration-line-2" : "text-ink",
        )}
      >
        {label}
      </button>
      <span className="flex items-center gap-4">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="font-mono text-[13px] text-ink-4 opacity-0 transition-[opacity,color] duration-300 group-hover:opacity-100 hover:text-ink max-sm:opacity-100"
            aria-label={`Remove ${label}`}
          >
            ×
          </button>
        )}
        <button type="button" onClick={onToggle} aria-label={done ? `Untick ${label}` : `Tick ${label}`} className="-m-2 p-2">
          <CheckBox on={done} />
        </button>
      </span>
    </div>
  );
}

/**
 * The daily ritual: Meridian rows with a gold index, a mono label and a square
 * box that fills jade. `layout="split"` adds the Today aside with the count.
 */
export function Ritual({
  day,
  items,
  checklist,
  tasks: initialTasks,
  layout = "stack",
}: {
  day: string;
  items: RitualItem[];
  checklist: Record<string, boolean>;
  tasks: DayTask[];
  layout?: "stack" | "split";
}) {
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
  const all = total > 0 && done === total;
  let n = 0;

  const list = (
    <div className="space-y-[clamp(2.4rem,6vh,3.4rem)]">
      {GROUPS.map((g) => {
        const rows = items.filter((i) => i.group === g.key);
        if (!rows.length) return null;
        const gDone = rows.filter((i) => checked[i.id]).length;
        return (
          <Rise key={g.key}>
            <GroupHead right={`${gDone} / ${rows.length}`}>{g.label}</GroupHead>
            <div className="border-b border-line">
              {rows.map((i) => (
                <CheckRow key={i.id} i={++n} done={!!checked[i.id]} label={i.label} onToggle={() => toggle(i.id)} />
              ))}
            </div>
          </Rise>
        );
      })}
      <Rise>
        <GroupHead right={tasks.length ? `${tasks.filter((t) => t.done).length} / ${tasks.length}` : undefined}>Today&apos;s to-dos</GroupHead>
        <div>
          {tasks.map((t) => (
            <CheckRow
              key={t.id}
              i={++n}
              done={t.done}
              label={t.label}
              onToggle={() => persistTasks(tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
              onDelete={() => persistTasks(tasks.filter((x) => x.id !== t.id))}
            />
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addTask();
            }}
            className="grid grid-cols-[2.2rem_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line pt-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:gap-x-4"
          >
            <span className="font-mono text-[11px] tracking-[0.1em] text-ink-4">+</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add something for today"
              aria-label="Add a to-do for today"
              maxLength={200}
              className="min-w-0 border-0 border-b border-line-2 bg-transparent py-2.5 font-mono text-[12.5px] tracking-[0.03em] text-ink transition-colors duration-300 placeholder:text-ink-4 focus:border-ink-3 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="font-mono text-[10px] tracking-[0.26em] text-ink-4 uppercase transition-colors duration-300 hover:text-ink disabled:opacity-40"
            >
              Add ↵
            </button>
          </form>
        </div>
      </Rise>
    </div>
  );

  const progress = (
    <div className="mt-6 h-px w-full max-w-[220px] bg-line-2">
      <div className="h-px bg-pos transition-[width] duration-1000" style={{ width: `${total ? (done / total) * 100 : 0}%`, transitionTimingFunction: EASE }} />
    </div>
  );

  if (layout === "split") {
    return (
      <Split
        aside={
          <Aside label="The ritual" figure={done} unit={`/ ${total}`} tone={all ? "pos" : null} caption={all ? <>Complete <span className="text-gold">◆</span></> : "Ticked today"}>
            {progress}
            <p className="mt-6 max-w-[30ch] font-mono text-[11px] leading-[1.85] tracking-[0.02em] text-ink-3">
              The same few things, in the same order, every day. Repetition is the edge.
            </p>
          </Aside>
        }
      >
        {list}
      </Split>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center gap-4">
        <div className="h-px flex-1 bg-line-2">
          <div className="h-px bg-pos transition-[width] duration-1000" style={{ width: `${total ? (done / total) * 100 : 0}%`, transitionTimingFunction: EASE }} />
        </div>
        <span className="num text-[11px] text-ink-3">
          {done} / {total}
        </span>
      </div>
      {list}
    </div>
  );
}
