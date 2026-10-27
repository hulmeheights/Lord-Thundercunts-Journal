/**
 * Trade grades: how good the trade was as a trade, A+ to F, judged on the
 * setup and whether you should have taken it, not on the P&L. The breakdown
 * shows whether your A+ trades really pay and what the F ones cost.
 */
import type { Trade } from "../types";

export const GRADES = ["A+", "A", "B", "C", "F"] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_HINT: Record<Grade, string> = {
  "A+": "Your best play: every box ticked, taken exactly to plan.",
  A: "A strong setup with one small flaw.",
  B: "Decent, but not your best. Fine to take, small.",
  C: "Weak or forced. Probably shouldn't have.",
  F: "Shouldn't have taken it: no setup, tilt, revenge or boredom.",
};

export type GradeRow = { grade: Grade; trades: number; wins: number; winRate: number | null; net: number; avg: number | null };

/** Per grade: trades, win rate, net and average. Ungraded trades are counted separately. */
export function gradeBreakdown(trades: readonly Trade[]): { rows: GradeRow[]; graded: number; ungraded: number } {
  const rows = GRADES.map((grade) => {
    const g = trades.filter((t) => t.grade === grade);
    const net = Math.round(g.reduce((s, t) => s + t.netPnl, 0) * 100) / 100;
    const wins = g.filter((t) => t.netPnl > 0).length;
    return { grade, trades: g.length, wins, winRate: g.length ? wins / g.length : null, net, avg: g.length ? Math.round((net / g.length) * 100) / 100 : null };
  });
  const graded = rows.reduce((s, r) => s + r.trades, 0);
  return { rows, graded, ungraded: trades.length - graded };
}
