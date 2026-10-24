"use client";

import { useId } from "react";
import { growFlight, type Stage } from "@/lib/analytics/tree";

const CSS = `
@keyframes ltj-drift { from { transform: translateY(0); } to { transform: translateY(520px); } }
@keyframes ltj-flicker { 0%, 100% { transform: scaleY(1) scaleX(1); } 30% { transform: scaleY(1.25) scaleX(0.92); } 60% { transform: scaleY(0.9) scaleX(1.06); } }
@keyframes ltj-breathe { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.9; transform: scale(1.18); } }
@keyframes ltj-hover { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes ltj-pop { 0% { opacity: 0; transform: scale(0.1); } 70% { transform: scale(1.2); } 100% { opacity: 1; transform: scale(1); } }
@keyframes ltj-halo { 0% { opacity: 0.8; transform: scale(0.5); } 100% { opacity: 0; transform: scale(3.2); } }
@keyframes ltj-spin { to { transform: rotate(360deg); } }
.ltj-scene .drift { animation: ltj-drift linear infinite; }
.ltj-scene .flame, .ltj-scene .glow, .ltj-scene .pop, .ltj-scene .halo { transform-box: fill-box; }
.ltj-scene .flame { transform-origin: top center; animation: ltj-flicker 0.22s ease-in-out infinite; }
.ltj-scene .glow { transform-origin: center; animation: ltj-breathe 2.4s ease-in-out infinite; }
.ltj-scene .craft { animation: ltj-hover 3.6s ease-in-out infinite; }
.ltj-scene .pop { transform-origin: center; animation: ltj-pop 1s cubic-bezier(0.16,1,0.3,1) both; }
.ltj-scene .halo { transform-origin: center; animation: ltj-halo 1.8s ease-out both; }
@media (prefers-reduced-motion: reduce) { .ltj-scene * { animation: none !important; } }
`;

/**
 * The mission: a rocket flown by your discipline, past a ringed world for every
 * goal reached, towards the destination you named. The engine runs hotter the
 * longer your clean-day streak; a recent leak makes it sputter.
 */
export function MissionScene({ stages, altitude, streak, leaking, fresh }: { stages: Stage[]; altitude: number; streak: number; leaking: boolean; fresh?: string | null }) {
  const id = useId().replace(/:/g, "");
  const f = growFlight(stages, altitude);
  const { x, y } = f.rocket;
  const hot = streak >= 5;
  const flameLen = leaking ? 12 : 22 + Math.min(streak, 10) * 2.4;
  // Faster stars the hotter the engine.
  const speed = [90, 55, 30].map((s) => s / (1 + Math.min(streak, 10) * 0.12));

  return (
    <svg viewBox={`0 0 ${f.width} ${f.height}`} className="ltj-scene h-auto w-full" role="img" aria-label={`Mission: altitude ${altitude}, ${streak} clean days in a row, ${stages.filter((s) => s.done).length} of ${stages.length} goals reached`}>
      <style>{CSS}</style>
      <defs>
        <linearGradient id={`hull${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="var(--ink-2)" />
          <stop offset="0.45" stopColor="var(--ink)" />
          <stop offset="1" stopColor="var(--ink-3)" />
        </linearGradient>
        <radialGradient id={`glow${id}`}>
          <stop offset="0" stopColor={hot ? "var(--ink)" : "var(--gold)"} stopOpacity="0.9" />
          <stop offset="0.4" stopColor="var(--gold)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`planet${id}`} cx="0.35" cy="0.35">
          <stop offset="0" stopColor="var(--ink)" stopOpacity="0.9" />
          <stop offset="0.35" stopColor="var(--gold)" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0.35" />
        </radialGradient>
        <clipPath id={`frame${id}`}>
          <rect width={f.width} height={f.height} />
        </clipPath>
      </defs>

      <g clipPath={`url(#frame${id})`}>
        {/* Parallax: three layers of stars drifting past, nearest fastest. */}
        {f.layers.map((layer, L) => (
          <g key={L} className="drift" style={{ animationDuration: `${speed[L]}s` }}>
            {[0, -f.height].map((dy) => (
              <g key={dy} transform={`translate(0 ${dy})`}>
                {layer.map((d, i) => (
                  <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={L === 2 ? "var(--ink-2)" : "var(--ink-4)"} opacity={0.4 + L * 0.25} />
                ))}
              </g>
            ))}
          </g>
        ))}

        {/* The destination: grows as the goals fall behind you. */}
        <g>
          <circle cx={f.destination.x} cy={f.destination.y} r={f.destination.r * 1.9} fill={`url(#glow${id})`} opacity={0.35} />
          <circle cx={f.destination.x} cy={f.destination.y} r={f.destination.r} fill={`url(#planet${id})`} />
          <ellipse cx={f.destination.x} cy={f.destination.y} rx={f.destination.r * 1.75} ry={f.destination.r * 0.38} fill="none" stroke="var(--gold)" strokeWidth={1.2} opacity={0.8} transform={`rotate(-16 ${f.destination.x} ${f.destination.y})`} />
        </g>

        <line x1={30} x2={f.width - 30} y1={f.ground} y2={f.ground} stroke="var(--line-2)" strokeWidth={1} />
        <path d={f.trail} fill="none" stroke="var(--ink-3)" strokeWidth={1.2} strokeDasharray={leaking ? "3 6" : "1 3"} strokeLinecap="round" opacity={0.75} />

        {f.worlds.map((w) =>
          w.done ? (
            <g key={w.id}>
              {fresh === w.id && <circle className="halo" cx={w.x} cy={w.y} r={w.r} fill="none" stroke="var(--gold)" strokeWidth={1.2} />}
              <g className="pop">
                <circle cx={w.x} cy={w.y} r={w.r} fill={`url(#planet${id})`} />
                <ellipse cx={w.x} cy={w.y} rx={w.r * 1.8} ry={w.r * 0.42} fill="none" stroke="var(--gold)" strokeWidth={1} transform={`rotate(-18 ${w.x} ${w.y})`} />
              </g>
            </g>
          ) : (
            <g key={w.id}>
              <circle cx={w.x} cy={w.y} r={w.r} fill="none" stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="2 2.5" />
              <circle cx={w.x} cy={w.y} r={1.2} fill="var(--gold)" />
            </g>
          ),
        )}

        {/* The craft. */}
        <g className="craft">
          <circle className="glow" cx={x} cy={y + 30} r={hot ? 30 : 22} fill={`url(#glow${id})`} />
          <path className="flame" d={`M${x - 6.5} ${y + 24} Q${x} ${y + 24 + flameLen * 1.6} ${x + 6.5} ${y + 24} Z`} fill="var(--gold)" opacity={leaking ? 0.55 : 0.92} />
          <path className="flame" style={{ animationDelay: "0.08s" }} d={`M${x - 3} ${y + 24} Q${x} ${y + 24 + flameLen} ${x + 3} ${y + 24} Z`} fill={hot ? "var(--ink)" : "var(--gold)"} opacity={0.95} />
          {/* fins */}
          <path d={`M${x - 8} ${y + 4} L${x - 18} ${y + 22} L${x - 17} ${y + 26} L${x - 8} ${y + 20} Z`} fill="var(--gold)" opacity={0.85} />
          <path d={`M${x + 8} ${y + 4} L${x + 18} ${y + 22} L${x + 17} ${y + 26} L${x + 8} ${y + 20} Z`} fill="var(--gold)" opacity={0.85} />
          {/* nozzle */}
          <path d={`M${x - 5.5} ${y + 20} L${x + 5.5} ${y + 20} L${x + 7} ${y + 25} L${x - 7} ${y + 25} Z`} fill="var(--ink-3)" />
          {/* hull */}
          <path d={`M${x} ${y - 34} C${x + 11} ${y - 22} ${x + 10} ${y + 4} ${x + 8} ${y + 21} L${x - 8} ${y + 21} C${x - 10} ${y + 4} ${x - 11} ${y - 22} ${x} ${y - 34} Z`} fill={`url(#hull${id})`} />
          {/* nose */}
          <path d={`M${x} ${y - 34} C${x + 4.5} ${y - 29} ${x + 6.5} ${y - 25} ${x + 7.5} ${y - 21} L${x - 7.5} ${y - 21} C${x - 6.5} ${y - 25} ${x - 4.5} ${y - 29} ${x} ${y - 34} Z`} fill="var(--gold)" />
          <line x1={x - 9.2} x2={x + 9.2} y1={y + 9} y2={y + 9} stroke="var(--ink-3)" strokeWidth={0.8} />
          {/* window */}
          <circle cx={x} cy={y - 9} r={4.4} fill="var(--bg)" stroke="var(--gold)" strokeWidth={1} />
          <circle cx={x - 1.3} cy={y - 10.3} r={1.4} fill="var(--pos)" opacity={0.9} />
        </g>
      </g>
    </svg>
  );
}
