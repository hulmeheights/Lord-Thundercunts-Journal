"use client";

import { ArrowDownRight, ArrowUpRight, ChevronDown, Minus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { OBSTACLE_LABELS } from "@/lib/analytics/observer";
import { shortDate } from "@/lib/analytics/time";
import type { ObserverSession } from "@/lib/data/observer";
import { removeObserverSession } from "@/lib/actions/observer";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { CaseFileLoader } from "./CaseFile";

const VERDICT_PILL = {
  aligned: "bg-pos/12 text-pos",
  partial: "bg-yellow/12 text-yellow",
  blind: "bg-orange/12 text-orange",
  unknown: "bg-fill-2 text-ink-3",
} as const;
const VERDICT_LABEL = { aligned: "Saw it clearly", partial: "Half the picture", blind: "Blind spot", unknown: "Too early to tell" } as const;

function Trend({ then, now }: { then: number; now: number | undefined }) {
  if (now === undefined) {
    return (
      <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-pos">
        <ArrowDownRight size={14} /> gone now
      </span>
    );
  }
  const diff = now - then;
  if (Math.abs(diff) < Math.max(25, then * 0.1)) {
    return (
      <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-3">
        <Minus size={14} /> about the same
      </span>
    );
  }
  return diff < 0 ? (
    <span className="num inline-flex items-center gap-1 text-[12.5px] font-semibold text-pos">
      <ArrowDownRight size={14} /> {fmtMoney(-diff)} smaller
    </span>
  ) : (
    <span className="num inline-flex items-center gap-1 text-[12.5px] font-semibold text-neg">
      <ArrowUpRight size={14} /> {fmtMoney(diff)} bigger
    </span>
  );
}

function SessionCard({ s, name, nowCost, aiReady }: { s: ObserverSession; name: string; nowCost: Record<string, number>; aiReady: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const top = s.snapshot.top[0];
  const verdict = s.gap?.verdict ?? "unknown";
  return (
    <div className="rounded-[22px] border border-line bg-fill/50">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14.5px] font-semibold">{shortDate(s.day)}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", VERDICT_PILL[verdict])}>{VERDICT_LABEL[verdict]}</span>
            {s.adopted.length > 0 && <span className="rounded-full bg-purple/12 px-2 py-0.5 text-[11.5px] font-semibold text-purple">{s.adopted.length} adopted</span>}
          </div>
          {top ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
              <span className="truncate">{top.title} · {fmtMoney(top.cost)}</span>
              <Trend then={top.cost} now={nowCost[top.key]} />
            </div>
          ) : (
            <div className="mt-1 text-[13px] text-ink-3">{s.snapshot.headline}</div>
          )}
        </div>
        <ChevronDown size={18} className={cn("shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-line p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["Wants", s.wants],
              ["Is doing", s.doing],
              ["Is stopped by", [s.believed.map((k) => OBSTACLE_LABELS[k]).join(" · "), s.stopping].filter(Boolean).join(" — ") || null],
              ["You told them", s.advice],
            ] as const).map(([label, value]) => (
              <div key={label}>
                <div className="eyebrow mb-1">{label}</div>
                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink-2">{value || <span className="text-ink-4">—</span>}</p>
              </div>
            ))}
          </div>
          {s.gap && <p className="rounded-2xl bg-fill-2 p-3 text-[13.5px] leading-relaxed text-ink-2">{s.gap.message}</p>}
          {(aiReady || s.ai) && <CaseFileLoader sessionId={s.id} name={name} initial={s.ai} />}
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!confirm("Delete this session?")) return;
                start(async () => {
                  await removeObserverSession(s.id);
                  router.refresh();
                });
              }}
            >
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SessionHistory({
  sessions,
  name,
  nowCost,
  aiReady,
  onNew,
}: {
  sessions: ObserverSession[];
  name: string;
  nowCost: Record<string, number>;
  aiReady: boolean;
  onNew: () => void;
}) {
  return (
    <section className="glass rounded-[28px] p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">Over time</div>
          <h2 className="title-lg">Every time you stepped outside</h2>
          <p className="mt-1 text-[13px] text-ink-3">Each one saves the evidence as it stood, so you can see whether the obstacle is shrinking.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onNew}>
          <Plus size={14} /> New
        </Button>
      </div>
      {sessions.length ? (
        <div className="space-y-2.5">
          {sessions.map((s) => (
            <SessionCard key={s.id} s={s} name={name} nowCost={nowCost} aiReady={aiReady} />
          ))}
        </div>
      ) : (
        <p className="text-[14px] leading-relaxed text-ink-3">
          Nothing yet. Do it once a week — Sunday evening works well — and watch the biggest obstacle shrink.
        </p>
      )}
    </section>
  );
}
