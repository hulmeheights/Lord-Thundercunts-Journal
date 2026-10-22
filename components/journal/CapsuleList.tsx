"use client";

import { useState } from "react";
import { markCapsuleOpened } from "@/lib/actions/journal";
import type { CapsuleStatus, GoalResult } from "@/lib/analytics/capsule";
import type { Capsule } from "@/lib/types";
import { cn } from "@/lib/cn";
import { CapsuleGoals } from "./CapsuleGoals";

export type CapsuleView = { capsule: Capsule; status: CapsuleStatus; results: GoalResult[]; daysLeft: number };

const date = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Row({ v }: { v: CapsuleView }) {
  const [status, setStatus] = useState(v.status);
  const c = v.capsule;
  const met = v.results.filter((r) => r.met === true).length;
  return (
    <article className="border-b border-line py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <span className="font-mono text-[10px] tracking-[0.26em] uppercase">
          {status === "sealed" ? (
            <span className="text-ink-3">
              ◆ Sealed · opens {date(c.deliverOn)} · <span className="text-gold">in {v.daysLeft} {v.daysLeft === 1 ? "day" : "days"}</span>
            </span>
          ) : status === "ready" ? (
            <span className="text-gold">◆ Ready to open · since {date(c.deliverOn)}</span>
          ) : (
            <span className="text-ink-4">Opened · due {date(c.deliverOn)}</span>
          )}
        </span>
        <span className="flex items-baseline gap-5 font-mono text-[10px] tracking-[0.22em] text-ink-4 uppercase">
          <span>Written {date(c.createdAt.slice(0, 10))}</span>
          {v.results.length > 0 && (
            <span className={cn(met === v.results.length && status !== "sealed" ? "text-pos" : "")}>
              {met} of {v.results.length} goals met
            </span>
          )}
        </span>
      </div>

      {status === "opened" ? (
        <p className="mt-4 max-w-[60ch] font-serif text-[clamp(1.1rem,2vw,1.35rem)] leading-[1.55] font-light whitespace-pre-wrap italic" data-private>
          “{c.message}”
        </p>
      ) : status === "ready" ? (
        <button
          type="button"
          onClick={() => {
            setStatus("opened");
            void markCapsuleOpened(c.id);
          }}
          className="m-link mt-4 pb-1 font-mono text-[10px] tracking-[0.3em] text-gold uppercase hover:text-ink"
        >
          Open it ↓
        </button>
      ) : (
        <p className="mt-4 font-serif text-[1.05rem] font-light text-ink-4 italic">The letter stays sealed until then. The goals are tracking.</p>
      )}

      <CapsuleGoals capsuleId={c.id} results={v.results} className="mt-5 max-w-[42rem]" />
    </article>
  );
}

/** Every capsule: what's sealed and when it opens, what's ready, and how the goals went. */
export function CapsuleList({ items }: { items: CapsuleView[] }) {
  const [showOpened, setShowOpened] = useState(false);
  if (!items.length) return null;
  const live = items.filter((v) => v.status !== "opened");
  const opened = items.filter((v) => v.status === "opened");
  return (
    <div className="mt-[clamp(3rem,7vh,4.5rem)]">
      <div className="mb-2 eyebrow">Your capsules</div>
      <div className="border-t border-line">
        {live.map((v) => (
          <Row key={v.capsule.id} v={v} />
        ))}
        {showOpened && opened.map((v) => <Row key={v.capsule.id} v={v} />)}
      </div>
      {opened.length > 0 && (
        <button type="button" onClick={() => setShowOpened((s) => !s)} className="mt-5 font-mono text-[10px] tracking-[0.26em] text-ink-3 uppercase hover:text-ink">
          {showOpened ? "Hide opened" : `Show ${opened.length} opened`}
        </button>
      )}
    </div>
  );
}
