import type { JournalDay, RitualItem, Trade } from "../types";
import type { RuleReport } from "./rules";
import { addDays, dayKey, isWeekend } from "./time";

export type Rings = { prepare: number; discipline: number; reflect: number };

const REVIEW_MIN_CHARS = 15;

/**
 * Trader Rings — three daily rings for the things you control:
 * Prepare (pre-market ritual), Discipline (rules kept), Reflect (review).
 * P&L is deliberately not a ring: you can close all three on a red day.
 */
export function ringsForDay(
  day: string,
  journal: JournalDay | undefined,
  ritual: RitualItem[],
  dayTrades: number,
  dayViolating: number,
): Rings {
  const pre = ritual.filter((r) => r.group === "pre");
  const post = ritual.filter((r) => r.group === "post");
  const checked = journal?.checklist ?? {};

  let preDone = pre.filter((r) => checked[r.id]).length;
  let preTotal = pre.length;
  preTotal += 1; // readiness check-in
  if (journal?.readiness) preDone += 1;
  preTotal += 1; // intention
  if (journal?.intention && journal.intention.trim()) preDone += 1;

  let postDone = post.filter((r) => checked[r.id]).length;
  let postTotal = post.length;
  postTotal += 1; // written review
  if ((journal?.review?.trim().length ?? 0) >= REVIEW_MIN_CHARS || (journal?.lessons?.trim().length ?? 0) >= REVIEW_MIN_CHARS) postDone += 1;

  const autoDiscipline = dayTrades > 0 ? 1 - dayViolating / dayTrades : 1;
  const manual = Object.values(journal?.rulesKept ?? {});
  const manualShare = manual.length ? manual.filter(Boolean).length / manual.length : null;
  const discipline = manualShare === null ? autoDiscipline : autoDiscipline * 0.7 + manualShare * 0.3;

  return {
    prepare: preTotal ? preDone / preTotal : 0,
    discipline: Math.max(0, Math.min(1, discipline)),
    reflect: postTotal ? postDone / postTotal : 0,
  };
}

export function ringsClosed(r: Rings): boolean {
  return r.prepare >= 0.999 && r.discipline >= 0.999 && r.reflect >= 0.999;
}

/** Consecutive weekdays (ending today or yesterday) with all three rings closed. */
export function ringStreak(
  today: string,
  journals: Map<string, JournalDay>,
  ritual: RitualItem[],
  trades: Trade[],
  rules: RuleReport,
  tz: string,
): number {
  const tradesPerDay = new Map<string, number>();
  for (const t of trades) {
    const d = dayKey(t.entryTime, tz);
    tradesPerDay.set(d, (tradesPerDay.get(d) ?? 0) + 1);
  }
  const ringsOn = (day: string) =>
    ringsForDay(day, journals.get(day), ritual, tradesPerDay.get(day) ?? 0, rules.byDay.get(day)?.violating ?? 0);

  let streak = 0;
  let day = today;
  if (!ringsClosed(ringsOn(today))) day = addDays(today, -1);
  for (let i = 0; i < 400; i++) {
    if (isWeekend(day)) {
      day = addDays(day, -1);
      continue;
    }
    if (!ringsClosed(ringsOn(day))) break;
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}
