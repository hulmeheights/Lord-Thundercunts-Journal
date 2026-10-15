"use client";

import { useEffect, useRef, useState } from "react";
import { useSize } from "@/components/charts/useSize";
import { shortDate } from "@/lib/analytics/time";
import { prefersReducedMotion } from "@/lib/motion";

export type ThreadDay = { day: string; closed: boolean; traded: boolean };

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const H = 92;

/**
 * The process streak as a vine: a hairline stem through your recent sessions,
 * a jade leaf on every day you closed all three, the unbroken run drawn in
 * jade up to today's gold bud. It grows in when it scrolls into view.
 */
export function Vine({ days, today }: { days: ThreadDay[]; today: string }) {
  const [box, { width: W }] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setGrown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setGrown(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [W]);

  const n = days.length;
  // The unbroken run: trailing closed days, ignoring today while it's still open.
  let end = n - 1;
  if (end >= 0 && days[end]!.day === today && !days[end]!.closed) end -= 1;
  let start = end + 1;
  while (start - 1 >= 0 && days[start - 1]!.closed) start -= 1;
  const run = end - start + 1;

  const pad = 10;
  const x = (i: number) => pad + (n > 1 ? (i / (n - 1)) * (W - pad * 2) : (W - pad * 2) / 2);
  const y = (i: number) => H * 0.56 + Math.sin(i * 0.82 + 0.6) * 7;
  const path = (from: number, to: number) => {
    if (to <= from) return "";
    let d = `M${x(from).toFixed(1)},${y(from).toFixed(1)}`;
    for (let i = from + 1; i <= to; i++) {
      const mx = (x(i - 1) + x(i)) / 2;
      d += ` C${mx.toFixed(1)},${y(i - 1).toFixed(1)} ${mx.toFixed(1)},${y(i).toFixed(1)} ${x(i).toFixed(1)},${y(i).toFixed(1)}`;
    }
    return d;
  };
  // When today is open, the jade run still reaches up to today's bud.
  const runTo = run > 0 && end < n - 1 ? n - 1 : end;

  return (
    <div ref={box} className="relative w-full" style={{ height: H }}>
      {W > 0 && n > 0 && (
        <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 overflow-visible" aria-hidden>
          <path
            d={path(0, n - 1)}
            fill="none"
            stroke="var(--line-2)"
            strokeWidth="1"
            pathLength={1}
            strokeDasharray="1"
            style={{ strokeDashoffset: grown ? 0 : 1, transition: `stroke-dashoffset 1.8s ${EASE}` }}
          />
          {run > 0 && (
            <path
              d={path(start, runTo)}
              fill="none"
              stroke="var(--pos)"
              strokeWidth="1.4"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1"
              style={{ strokeDashoffset: grown ? 0 : 1, transition: `stroke-dashoffset 1.4s ${EASE} 0.9s` }}
            />
          )}
          {days.map((d, i) => {
            const isToday = d.day === today;
            const up = i % 2 === 0;
            const tone = isToday ? "var(--gold)" : "var(--pos)";
            return (
              <g key={d.day}>
                {d.closed && (
                  <g transform={`translate(${x(i).toFixed(1)},${y(i).toFixed(1)}) rotate(${up ? -32 : 148})`}>
                    <g
                      style={{
                        transformBox: "fill-box",
                        transformOrigin: "50% 100%",
                        transform: grown ? "scale(1)" : "scale(0)",
                        opacity: grown ? 1 : 0,
                        transition: `transform 0.9s ${EASE} ${0.5 + i * 0.05}s, opacity 0.6s ${EASE} ${0.5 + i * 0.05}s`,
                      }}
                    >
                      <path d="M0 0 C5.5 -5 5.5 -14 0 -19 C-5.5 -14 -5.5 -5 0 0 Z" fill={tone} fillOpacity="0.16" stroke={tone} strokeWidth="1" />
                      <path d="M0 -1 L0 -15" stroke={tone} strokeOpacity="0.55" strokeWidth="0.75" />
                    </g>
                  </g>
                )}
                {isToday ? (
                  <g>
                    <circle cx={x(i)} cy={y(i)} r="7" fill="none" stroke="var(--gold)" strokeOpacity="0.35" strokeWidth="1">
                      <animate attributeName="r" values="4;9;4" dur="3.2s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" values="0.45;0;0.45" dur="3.2s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={x(i)} cy={y(i)} r="3.2" fill="var(--gold)" />
                  </g>
                ) : d.closed ? (
                  <circle cx={x(i)} cy={y(i)} r="2.6" fill="var(--pos)" />
                ) : d.traded ? (
                  <circle cx={x(i)} cy={y(i)} r="2.4" fill="var(--bg)" stroke="var(--ink-3)" strokeWidth="1" />
                ) : (
                  <circle cx={x(i)} cy={y(i)} r="1.3" fill="var(--ink-4)" />
                )}
                <title>{`${shortDate(d.day)} · ${d.closed ? "all three closed" : d.traded ? "traded, process open" : "no session"}`}</title>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
