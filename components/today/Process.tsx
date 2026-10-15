import { cn } from "@/lib/cn";
import { Aside, Split } from "./Layout";

const ROWS = [
  { key: "prepare", title: "Prepare", hint: "Ritual, readiness and an intention" },
  { key: "discipline", title: "Discipline", hint: "Every trade inside your rules" },
  { key: "reflect", title: "Reflect", hint: "The review, written after the close" },
] as const;

/** Prepare · Discipline · Reflect as three Meridian rows, each with a 1px jade line that draws in. */
export function Process({ prepare, discipline, reflect, streak }: { prepare: number; discipline: number; reflect: number; streak: number }) {
  const v = { prepare, discipline, reflect };
  const closed = ROWS.filter((r) => v[r.key] >= 0.999).length;
  return (
    <Split
      aside={
        <Aside label="Process" figure={closed} unit="/ 3 closed" tone={closed === 3 ? "pos" : null}>
          <p className="mt-6 max-w-[30ch] font-mono text-[11px] leading-[1.85] tracking-[0.02em] text-ink-3">
            P&amp;L is not on this list. You can close all three on a red day — and that is the point.
          </p>
          {streak > 0 && (
            <p className="mt-4 font-mono text-[10px] tracking-[0.2em] text-ink-4 uppercase">
              <span className="num text-ink">{streak}</span> {streak === 1 ? "day" : "days"} unbroken <span className="text-gold">◆</span>
            </p>
          )}
        </Aside>
      }
    >
      <div className="border-b border-line">
        {ROWS.map((r, i) => {
          const val = Math.max(0, Math.min(1, v[r.key]));
          const done = val >= 0.999;
          return (
            <div key={r.key} className="reveal border-t border-line" style={{ "--d": `${i * 80}ms` } as React.CSSProperties}>
             <div className="m-row py-[clamp(1.4rem,3.4vh,2.1rem)]">
              <div className="grid grid-cols-[2.2rem_minmax(0,1fr)_auto] items-baseline gap-x-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:gap-x-4">
                <span className="font-mono text-[11px] tracking-[0.1em] text-gold">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <div className="font-serif text-[clamp(1.3rem,2.4vw,1.75rem)] leading-[1.2] font-normal tracking-[-0.01em]">{r.title}</div>
                  <div className="mt-1.5 font-mono text-[11.5px] leading-[1.7] tracking-[0.02em] text-ink-3">{r.hint}</div>
                </div>
                <span className={cn("num text-[13px]", done ? "text-pos" : "text-ink-3")}>{Math.round(val * 100)}%</span>
              </div>
              <div className="mt-5 h-px bg-line sm:ml-[3.5rem]">
                <div
                  className="h-px w-0 bg-pos transition-[width] duration-[1600ms] ease-[cubic-bezier(0.16,1,0.3,1)] [.in_&]:w-[var(--w)]"
                  style={{ "--w": `${val * 100}%`, transitionDelay: `${300 + i * 120}ms` } as React.CSSProperties}
                />
              </div>
             </div>
            </div>
          );
        })}
      </div>
    </Split>
  );
}
