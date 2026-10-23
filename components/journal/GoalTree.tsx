"use client";

import { growTree, type TreeGoal } from "@/lib/analytics/tree";

const CSS = `
@keyframes ltj-grow { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes ltj-leaf { from { opacity: 0; transform: scale(0.2); } to { opacity: 1; transform: scale(1); } }
@keyframes ltj-bloom { 0% { opacity: 0; transform: scale(0.1) rotate(-40deg); } 70% { transform: scale(1.25) rotate(6deg); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
@keyframes ltj-halo { 0% { opacity: 0.7; transform: scale(0.4); } 100% { opacity: 0; transform: scale(3); } }
.ltj-tree .grow { stroke-dasharray: 1; animation: ltj-grow 1.6s cubic-bezier(0.16,1,0.3,1) both; }
.ltj-tree .leaf, .ltj-tree .bloom, .ltj-tree .halo { transform-box: fill-box; transform-origin: center; }
.ltj-tree .leaf { animation: ltj-leaf 0.7s cubic-bezier(0.16,1,0.3,1) both; }
.ltj-tree .bloom { animation: ltj-bloom 1.1s cubic-bezier(0.16,1,0.3,1) both; }
.ltj-tree .halo { animation: ltj-halo 1.6s ease-out both; }
@media (prefers-reduced-motion: reduce) { .ltj-tree * { animation: none !important; stroke-dasharray: none !important; } }
`;

/** Five gold petals around a cream heart. */
function Blossom({ x, y, fresh }: { x: number; y: number; fresh: boolean }) {
  return (
    <g>
      {fresh && <circle className="halo" cx={x} cy={y} r={9} fill="none" stroke="var(--gold)" strokeWidth={1} />}
      <g className="bloom" style={{ animationDelay: fresh ? "0.9s" : "1.2s" }}>
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx={x} cy={y - 5.2} rx={3.1} ry={5.2} fill="var(--gold)" opacity={0.9} transform={`rotate(${a} ${x} ${y})`} />
        ))}
        <circle cx={x} cy={y} r={2.4} fill="var(--ink)" />
      </g>
    </g>
  );
}

/** The goal tree, drawn in hairlines: a leaf per step, a blossom per goal reached. */
export function GoalTree({ goals, fresh }: { goals: TreeGoal[]; fresh?: string | null }) {
  const t = growTree(goals);
  return (
    <svg viewBox={`0 ${t.crown} ${t.width} ${t.height - t.crown}`} className="ltj-tree h-auto w-full" role="img" aria-label={`Your tree: ${goals.length} goals, ${goals.filter((g) => g.done).length} reached`}>
      <style>{CSS}</style>
      <line x1={40} x2={t.width - 40} y1={t.ground} y2={t.ground} stroke="var(--line-2)" strokeWidth={1} />
      {t.roots.map((d) => (
        <path key={d} d={d} fill="none" stroke="var(--ink-4)" strokeWidth={1} strokeLinecap="round" />
      ))}
      <path className="grow" pathLength={1} d={t.trunk} fill="none" stroke="var(--ink-2)" strokeWidth={t.trunkWidth} strokeLinecap="round" />
      {t.branches.map((b, i) => (
        <g key={b.id}>
          <path
            className="grow"
            pathLength={1}
            d={b.d}
            fill="none"
            stroke={b.done ? "var(--ink-2)" : "var(--ink-3)"}
            strokeWidth={b.done ? 1.8 : 1.2}
            strokeLinecap="round"
            style={{ animationDelay: `${0.5 + i * 0.08}s` }}
          />
          {b.leaves.map((l, k) => (
            <ellipse
              key={k}
              className="leaf"
              cx={l.x}
              cy={l.y}
              rx={2.4}
              ry={5.6}
              fill="var(--pos)"
              opacity={0.85}
              transform={`rotate(${l.angle} ${l.x} ${l.y})`}
              style={{ animationDelay: `${0.9 + i * 0.08 + k * 0.05}s` }}
            />
          ))}
          {b.done ? (
            <Blossom x={b.tip.x} y={b.tip.y} fresh={fresh === b.id} />
          ) : (
            <circle cx={b.tip.x} cy={b.tip.y} r={2.6} fill="var(--bg)" stroke="var(--gold)" strokeWidth={1} />
          )}
        </g>
      ))}
    </svg>
  );
}
