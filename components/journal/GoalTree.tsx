"use client";

import { growRocket, growSky, growTree, type TreeGoal } from "@/lib/analytics/tree";

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
@keyframes ltj-twinkle { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.9; } }
@keyframes ltj-flame { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.35); } }
@keyframes ltj-rise { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.ltj-tree .twinkle { animation: ltj-twinkle 3.2s ease-in-out infinite; }
.ltj-tree .flame { transform-box: fill-box; transform-origin: top center; animation: ltj-flame 0.35s ease-in-out infinite; }
.ltj-tree .rise { animation: ltj-rise 1.6s cubic-bezier(0.16,1,0.3,1) both; }
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

/** The sky: each goal a constellation, each step a star joined to the last, a reached goal shining gold. */
export function GoalSky({ goals, fresh }: { goals: TreeGoal[]; fresh?: string | null }) {
  const sky = growSky(goals);
  return (
    <svg viewBox={`0 0 ${sky.width} ${sky.height}`} className="ltj-tree h-auto w-full" role="img" aria-label={`Your sky: ${goals.length} constellations, ${goals.filter((g) => g.done).length} complete`}>
      <style>{CSS}</style>
      {sky.dust.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="var(--ink-4)" className={i % 5 === 0 ? "twinkle" : undefined} style={{ animationDelay: `${(i % 7) * 0.4}s` }} />
      ))}
      {sky.constellations.map((c, i) => (
        <g key={c.id}>
          <path className="grow" pathLength={1} d={c.lines} fill="none" stroke={c.done ? "var(--gold)" : "var(--ink-3)"} strokeWidth={c.done ? 0.9 : 0.6} opacity={c.done ? 0.8 : 0.6} style={{ animationDelay: `${0.3 + i * 0.1}s` }} />
          {c.stars.map((st, k) => (
            <circle key={k} className="leaf" cx={st.x} cy={st.y} r={st.r} fill={c.done ? "var(--ink)" : "var(--ink-2)"} style={{ animationDelay: `${0.6 + i * 0.1 + k * 0.05}s` }} />
          ))}
          {c.done ? (
            <g>
              {fresh === c.id && <circle className="halo" cx={c.anchor.x} cy={c.anchor.y} r={8} fill="none" stroke="var(--gold)" strokeWidth={1} />}
              <g className="bloom" style={{ animationDelay: fresh === c.id ? "0.8s" : "1s" }}>
                <circle cx={c.anchor.x} cy={c.anchor.y} r={9} fill="var(--gold)" opacity={0.18} />
                <path d={`M${c.anchor.x} ${c.anchor.y - 8} L${c.anchor.x + 2} ${c.anchor.y - 2} L${c.anchor.x + 8} ${c.anchor.y} L${c.anchor.x + 2} ${c.anchor.y + 2} L${c.anchor.x} ${c.anchor.y + 8} L${c.anchor.x - 2} ${c.anchor.y + 2} L${c.anchor.x - 8} ${c.anchor.y} L${c.anchor.x - 2} ${c.anchor.y - 2} Z`} fill="var(--gold)" />
              </g>
            </g>
          ) : (
            <circle cx={c.anchor.x} cy={c.anchor.y} r={3} fill="var(--bg)" stroke="var(--gold)" strokeWidth={1} />
          )}
        </g>
      ))}
    </svg>
  );
}

/** The rocket: every step lifts it, every goal reached is a world it has flown past. */
export function GoalRocket({ goals, fresh }: { goals: TreeGoal[]; fresh?: string | null }) {
  const f = growRocket(goals);
  const { x, y } = f.rocket;
  return (
    <svg viewBox={`0 0 ${f.width} ${f.height}`} className="ltj-tree h-auto w-full" role="img" aria-label={`Your rocket: altitude ${f.altitude}, ${goals.filter((g) => g.done).length} worlds passed`}>
      <style>{CSS}</style>
      {f.dust.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="var(--ink-4)" className={i % 4 === 0 ? "twinkle" : undefined} style={{ animationDelay: `${(i % 6) * 0.5}s` }} />
      ))}
      <line x1={40} x2={f.width - 40} y1={f.ground} y2={f.ground} stroke="var(--line-2)" strokeWidth={1} />
      <path className="grow" pathLength={1} d={f.trail} fill="none" stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="1" opacity={0.7} />
      {f.worlds.map((w) =>
        w.done ? (
          <g key={w.id}>
            {fresh === w.id && <circle className="halo" cx={w.x} cy={w.y} r={w.r} fill="none" stroke="var(--gold)" strokeWidth={1} />}
            <g className="bloom">
              <circle cx={w.x} cy={w.y} r={w.r} fill="var(--gold)" opacity={0.85} />
              <ellipse cx={w.x} cy={w.y} rx={w.r * 1.8} ry={w.r * 0.45} fill="none" stroke="var(--gold)" strokeWidth={1} transform={`rotate(-18 ${w.x} ${w.y})`} />
            </g>
          </g>
        ) : (
          <circle key={w.id} cx={w.x} cy={w.y} r={w.r} fill="none" stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="2 2" />
        ),
      )}
      <g className="rise">
        <path className="flame" d={`M${x - 4} ${y + 18} Q${x} ${y + 34} ${x + 4} ${y + 18} Z`} fill="var(--gold)" opacity={0.9} />
        <path d={`M${x} ${y - 22} C${x + 9} ${y - 12} ${x + 8} ${y + 6} ${x + 6} ${y + 18} L${x - 6} ${y + 18} C${x - 8} ${y + 6} ${x - 9} ${y - 12} ${x} ${y - 22} Z`} fill="var(--ink)" />
        <circle cx={x} cy={y - 6} r={2.6} fill="var(--bg)" stroke="var(--pos)" strokeWidth={1} />
        <path d={`M${x - 6} ${y + 8} L${x - 12} ${y + 20} L${x - 6} ${y + 18} Z M${x + 6} ${y + 8} L${x + 12} ${y + 20} L${x + 6} ${y + 18} Z`} fill="var(--ink-2)" />
      </g>
    </svg>
  );
}
