/**
 * Time-capsule goals: targets sealed with a letter, checked against your own
 * trades and ledger between the day you sealed it and the day it opens. Pure
 * functions, so the maths is unit-tested.
 */
import type { Capsule, CapsuleGoal, GoalKind, Trade } from "../types";
import { fmtMoney } from "../format";
import { qtyOf, type LedgerEntry } from "./ledger";
import { dailySeries } from "./stats";
import { detectTilt } from "./tilt";
import { dayKey } from "./time";

export const GOAL_KINDS: { kind: GoalKind; label: string; unit: "$" | "%" | "count" | null; placeholder?: number }[] = [
  { kind: "net", label: "Net P&L of at least", unit: "$", placeholder: 5000 },
  { kind: "winRate", label: "Win rate of at least", unit: "%", placeholder: 55 },
  { kind: "greenDays", label: "Green days of at least", unit: "%", placeholder: 70 },
  { kind: "maxTradesPerDay", label: "Never more trades a day than", unit: "count", placeholder: 3 },
  { kind: "noRevenge", label: "No revenge trades", unit: null },
  { kind: "evalsPassed", label: "Evals passed, at least", unit: "count", placeholder: 5 },
  { kind: "payouts", label: "Payouts, at least", unit: "count", placeholder: 3 },
  { kind: "paidOut", label: "Paid out, at least", unit: "$", placeholder: 5000 },
  { kind: "custom", label: "Something else (you tick it)", unit: null },
];

export function goalLabel(g: CapsuleGoal): string {
  const t = g.target ?? 0;
  switch (g.kind) {
    case "net": return `Make ${fmtMoney(t, { sign: true })} net`;
    case "winRate": return `Win ${t}% of trades`;
    case "greenDays": return `${t}% of trading days green`;
    case "maxTradesPerDay": return `Never more than ${t} ${t === 1 ? "trade" : "trades"} a day`;
    case "noRevenge": return "No revenge trades";
    case "evalsPassed": return `Pass ${t} ${t === 1 ? "eval" : "evals"}`;
    case "payouts": return `Get ${t} ${t === 1 ? "payout" : "payouts"}`;
    case "paidOut": return `${fmtMoney(t)} paid out`;
    case "custom": return g.text?.trim() || "A goal of your own";
  }
}

export type GoalResult = {
  goal: CapsuleGoal;
  label: string;
  /** true met, false missed (or broken), null not decided yet. */
  met: boolean | null;
  /** Where it stands, in words. */
  actual: string;
  /** 0–1 towards the target, for the hairline. */
  progress: number;
  /** Ticked by you, not measured. */
  manual: boolean;
};

export type CapsuleStatus = "sealed" | "ready" | "opened";

export function capsuleStatus(c: Pick<Capsule, "deliverOn" | "openedAt">, today: string): CapsuleStatus {
  if (c.openedAt) return "opened";
  return c.deliverOn <= today ? "ready" : "sealed";
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/**
 * Every goal on a capsule, measured from the day it was sealed to the day it
 * opens (or today, while it's still sealed). Totals that are already reached
 * count as met early; rates and "never" goals are only decided on opening day.
 */
export function evaluateCapsule(c: Capsule, trades: Trade[], ledger: LedgerEntry[], tz: string, today: string): GoalResult[] {
  const from = dayKey(c.createdAt, tz);
  const to = c.deliverOn < today ? c.deliverOn : today;
  const final = c.deliverOn <= today;
  const inWindow = trades.filter((t) => {
    const d = dayKey(t.exitTime, tz);
    return d >= from && d <= c.deliverOn && d <= to;
  });
  const days = dailySeries(inWindow, tz);
  const led = ledger.filter((e) => e.day >= from && e.day <= c.deliverOn && e.day <= to);
  const count = (kind: LedgerEntry["kind"]) => led.filter((e) => e.kind === kind).reduce((n, e) => n + qtyOf(e), 0);

  return (c.goals ?? []).map((g): GoalResult => {
    const t = g.target ?? 0;
    const label = goalLabel(g);
    const base = { goal: g, label, manual: false };
    const reach = (have: number, shown: string): GoalResult => ({
      ...base,
      met: have >= t ? true : final ? false : null,
      actual: shown,
      progress: clamp01(t > 0 ? have / t : 1),
    });
    switch (g.kind) {
      case "net": {
        const net = inWindow.reduce((n, x) => n + x.netPnl, 0);
        return reach(net, `${fmtMoney(net, { sign: true })}${final ? "" : " so far"}`);
      }
      case "evalsPassed": {
        const n = count("passed");
        return reach(n, `${n} passed${final ? "" : " so far"}`);
      }
      case "payouts": {
        const n = count("payout");
        return reach(n, `${n} ${n === 1 ? "payout" : "payouts"}${final ? "" : " so far"}`);
      }
      case "paidOut": {
        const n = led.filter((e) => e.kind === "payout").reduce((s, e) => s + Math.max(0, e.amount), 0);
        return reach(n, `${fmtMoney(n)}${final ? "" : " so far"}`);
      }
      case "winRate": {
        const wins = inWindow.filter((x) => x.netPnl > 0).length;
        const rate = inWindow.length ? (wins / inWindow.length) * 100 : 0;
        const shown = inWindow.length ? `${Math.round(rate)}% of ${inWindow.length} trades` : "no trades yet";
        return { ...base, met: final ? inWindow.length > 0 && rate >= t : null, actual: shown, progress: clamp01(t > 0 ? rate / t : 1) };
      }
      case "greenDays": {
        const green = days.filter((d) => d.net > 0).length;
        const rate = days.length ? (green / days.length) * 100 : 0;
        const shown = days.length ? `${Math.round(rate)}% of ${days.length} days` : "no trading days yet";
        return { ...base, met: final ? days.length > 0 && rate >= t : null, actual: shown, progress: clamp01(t > 0 ? rate / t : 1) };
      }
      case "maxTradesPerDay": {
        const busiest = days.reduce((m, d) => Math.max(m, d.trades), 0);
        const broken = busiest > t;
        return {
          ...base,
          met: broken ? false : final ? true : null,
          actual: days.length ? `busiest day: ${busiest} ${busiest === 1 ? "trade" : "trades"}` : "no trading days yet",
          progress: broken ? 0 : 1,
        };
      }
      case "noRevenge": {
        const n = detectTilt(inWindow, tz).flaggedIds.size;
        return { ...base, met: n > 0 ? false : final ? true : null, actual: n ? `${n} revenge ${n === 1 ? "trade" : "trades"}` : "none so far", progress: n ? 0 : 1 };
      }
      case "custom":
        return { ...base, manual: true, met: g.done ? true : null, actual: g.done ? "ticked" : "tick it when it's done", progress: g.done ? 1 : 0 };
    }
  });
}
