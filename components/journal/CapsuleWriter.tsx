"use client";

import { useState, useTransition } from "react";
import { scheduleCapsule } from "@/lib/actions/journal";
import { GOAL_KINDS, goalLabel } from "@/lib/analytics/capsule";
import type { CapsuleGoal, GoalKind } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Seg } from "@/components/m/Seg";

const gid = () => Math.random().toString(36).slice(2, 10);

/** Letters to your future self, with goals that are checked against your data when they open. */
export function CapsuleWriter({ pending: _pending }: { pending: number }) {
  const [msg, setMsg] = useState("");
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [goals, setGoals] = useState<CapsuleGoal[]>([]);
  const [kind, setKind] = useState<GoalKind>("net");
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, start] = useTransition();
  const meta = GOAL_KINDS.find((k) => k.kind === kind)!;

  const addGoal = () => {
    if (goals.length >= 12) return;
    if (kind === "custom") {
      if (!value.trim()) return;
      setGoals((g) => [...g, { id: gid(), kind, target: null, text: value.trim().slice(0, 160) }]);
    } else if (meta.unit === null) {
      if (goals.some((g) => g.kind === kind)) return;
      setGoals((g) => [...g, { id: gid(), kind, target: null }]);
    } else {
      const n = Number(value.replace(/[,$%\s]/g, ""));
      if (!value.trim() || !Number.isFinite(n)) return;
      setGoals((g) => [...g, { id: gid(), kind, target: meta.unit === "%" ? Math.min(100, Math.max(0, n)) : Math.round(n) }]);
    }
    setValue("");
  };

  return (
    <div>
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={4}
        maxLength={4000}
        placeholder="Remember why you started…"
        aria-label="Message to your future self"
        className="w-full resize-none border-0 border-b border-line-2 bg-transparent pb-3 font-serif text-[clamp(1.1rem,2vw,1.35rem)] leading-[1.6] font-light text-ink outline-none placeholder:text-ink-4 placeholder:italic focus:border-gold"
      />

      <div className="mt-7">
        <span className="mb-3 block font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">Goals · optional · checked against your data when it opens</span>
        {goals.length > 0 && (
          <ul className="mb-4 space-y-2">
            {goals.map((g) => (
              <li key={g.id} className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
                <span className="font-serif text-[1.05rem] font-light">
                  <span className="mr-2 text-[0.8em] text-gold">◆</span>
                  {goalLabel(g)}
                </span>
                <button type="button" onClick={() => setGoals((gs) => gs.filter((x) => x.id !== g.id))} className="font-mono text-[9.5px] tracking-[0.22em] text-ink-4 uppercase hover:text-ink">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as GoalKind);
              setValue("");
            }}
            aria-label="Goal type"
            className="field h-9 min-w-0 flex-1 py-0 font-mono text-[11.5px]"
          >
            {GOAL_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
          {meta.unit !== null || kind === "custom" ? (
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addGoal();
                }
              }}
              inputMode={kind === "custom" ? "text" : "decimal"}
              placeholder={kind === "custom" ? "e.g. Journal every trading day" : `${meta.unit === "$" ? "$" : ""}${meta.placeholder}${meta.unit === "%" ? "%" : ""}`}
              aria-label="Goal target"
              maxLength={kind === "custom" ? 160 : 12}
              className={kind === "custom" ? "field h-9 min-w-[12rem] flex-[2]" : "field num h-9 w-28"}
            />
          ) : null}
          <Button variant="secondary" onClick={addGoal} disabled={goals.length >= 12}>
            + Add goal
          </Button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-5">
        <Seg value={days} onChange={setDays} options={[{ value: "7", label: "1 week" }, { value: "30", label: "1 month" }, { value: "90", label: "3 months" }]} />
        <Button
          variant={msg.trim() ? "primary" : "secondary"}
          disabled={busy || !msg.trim()}
          onClick={() =>
            start(async () => {
              await scheduleCapsule(msg, Number(days), goals);
              setMsg("");
              setGoals([]);
              setSent(true);
              setTimeout(() => setSent(false), 2600);
            })
          }
        >
          {sent ? (
            <>
              <span className="text-pos">◆</span> Sealed
            </>
          ) : busy ? (
            "Sealing…"
          ) : (
            "Seal it"
          )}
        </Button>
      </div>
    </div>
  );
}
