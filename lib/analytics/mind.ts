/**
 * How you've been, next to how you traded: each day, week, month or year with
 * the morning check-in, the mood after the bell, what was going on outside the
 * charts, and the P&L. Pure functions only, so the maths is unit-tested.
 */
import type { JournalDay, Trade } from "../types";
import { dailySeries } from "./stats";
import { MONTHS, startOfWeek } from "./time";

export type Grain = "day" | "week" | "month" | "year";
export const GRAINS: Grain[] = ["day", "week", "month", "year"];

/** What can be going on outside the charts. Pick any that fit the day. */
export const LIFE_TAGS = [
  "Family",
  "Relationship",
  "Kids",
  "Health",
  "Poor sleep",
  "Money worries",
  "Work",
  "Busy day",
  "Travel",
  "Exercised",
  "Good news",
  "Rested",
] as const;

export type Feel = "clear" | "level" | "bumpy";

/** The morning check-in as one number, 1–5. */
export function readinessScore(j: Pick<JournalDay, "readiness">): number | null {
  const r = j.readiness;
  return r ? (r.sleep + r.energy + r.focus + r.mood) / 4 : null;
}

/** How the day felt: the morning check-in if you did one, else the mood after the bell. */
export function feelScore(j: Pick<JournalDay, "readiness" | "moodAfter">): number | null {
  return readinessScore(j) ?? j.moodAfter ?? null;
}

export function feelOf(score: number | null): Feel | null {
  if (score === null) return null;
  return score >= 3.75 ? "clear" : score <= 2.5 ? "bumpy" : "level";
}

export type MindRow = {
  key: string;
  label: string;
  /** Days that traded. */
  tradingDays: number;
  /** Days with a check-in or a mood after the bell. */
  feltDays: number;
  readiness: number | null;
  moodAfter: number | null;
  feel: number | null;
  net: number;
  trades: number;
  greenDays: number;
  redDays: number;
  /** Life tags, most frequent first. */
  tags: { tag: string; days: number }[];
  /** What you wrote about life outside the charts, newest first. */
  notes: { day: string; note: string }[];
};

function periodKey(day: string, grain: Grain): string {
  if (grain === "day") return day;
  if (grain === "week") return startOfWeek(day);
  if (grain === "month") return day.slice(0, 7);
  return day.slice(0, 4);
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function shortDate(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!.slice(0, 3)}`;
}

export function periodLabel(key: string, grain: Grain): string {
  if (grain === "day") return `${WD[new Date(`${key}T00:00:00Z`).getUTCDay()]} ${shortDate(key)}`;
  if (grain === "week") return `Week of ${shortDate(key)}`;
  if (grain === "month") return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
  return key;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Every period that traded or has a feeling logged, newest first. */
export function mindTimeline(trades: Trade[], journals: JournalDay[], tz: string, grain: Grain): MindRow[] {
  const days = new Map(dailySeries(trades, tz).map((d) => [d.day, d]));
  const byDay = new Map(journals.filter((j) => !j.isSample || days.has(j.day)).map((j) => [j.day, j]));
  const allDays = [...new Set([...days.keys(), ...byDay.keys()])];
  const groups = new Map<string, string[]>();
  for (const d of allDays) {
    const k = periodKey(d, grain);
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }

  const rows: MindRow[] = [];
  for (const [key, ds] of groups) {
    const js = ds.map((d) => byDay.get(d)).filter((j): j is JournalDay => !!j);
    const ready = js.map(readinessScore).filter((x): x is number => x !== null);
    const after = js.map((j) => j.moodAfter).filter((x): x is number => x !== null);
    const felt = js.map(feelScore).filter((x): x is number => x !== null);
    const tagCount = new Map<string, number>();
    for (const j of js) for (const t of j.lifeTags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    const traded = ds.map((d) => days.get(d)).filter((x) => !!x);
    if (!traded.length && !felt.length && !tagCount.size && !js.some((j) => j.lifeNote)) continue;
    rows.push({
      key,
      label: periodLabel(key, grain),
      tradingDays: traded.length,
      feltDays: felt.length,
      readiness: r1(avg(ready)),
      moodAfter: r1(avg(after)),
      feel: r1(avg(felt)),
      net: r2(traded.reduce((n, d) => n + d!.net, 0)),
      trades: traded.reduce((n, d) => n + d!.trades, 0),
      greenDays: traded.filter((d) => d!.net > 0).length,
      redDays: traded.filter((d) => d!.net < 0).length,
      tags: [...tagCount].map(([tag, n]) => ({ tag, days: n })).sort((a, b) => b.days - a.days || a.tag.localeCompare(b.tag)),
      notes: js
        .filter((j) => j.lifeNote?.trim())
        .map((j) => ({ day: j.day, note: j.lifeNote!.trim() }))
        .sort((a, b) => b.day.localeCompare(a.day)),
    });
  }
  return rows.sort((a, b) => b.key.localeCompare(a.key));
}

export type FeelBucket = { feel: Feel; days: number; avgNet: number | null; net: number; greenRate: number | null };
export type TagEffect = { tag: string; days: number; avgNet: number; /** Average day without the tag. */ otherAvg: number | null };

export type MindSummary = {
  /** Trading days with a feeling logged. */
  days: number;
  buckets: FeelBucket[];
  /** Life tags on trading days, worst average day first. */
  tags: TagEffect[];
};

export function mindSummary(trades: Trade[], journals: JournalDay[], tz: string): MindSummary {
  const days = dailySeries(trades, tz);
  const byDay = new Map(journals.map((j) => [j.day, j]));
  const scored = days.map((d) => ({ d, j: byDay.get(d.day), f: feelOf(byDay.get(d.day) ? feelScore(byDay.get(d.day)!) : null) }));

  const buckets: FeelBucket[] = (["clear", "level", "bumpy"] as Feel[]).map((feel) => {
    const ds = scored.filter((x) => x.f === feel).map((x) => x.d);
    const net = ds.reduce((n, d) => n + d.net, 0);
    return { feel, days: ds.length, net: r2(net), avgNet: ds.length ? r2(net / ds.length) : null, greenRate: ds.length ? ds.filter((d) => d.net > 0).length / ds.length : null };
  });

  const tagged = new Map<string, number[]>();
  for (const { d, j } of scored) for (const t of j?.lifeTags ?? []) tagged.set(t, [...(tagged.get(t) ?? []), d.net]);
  const total = days.reduce((n, d) => n + d.net, 0);
  const tags: TagEffect[] = [...tagged]
    .filter(([, nets]) => nets.length >= 2)
    .map(([tag, nets]) => {
      const sum = nets.reduce((a, b) => a + b, 0);
      const rest = days.length - nets.length;
      return { tag, days: nets.length, avgNet: r2(sum / nets.length), otherAvg: rest > 0 ? r2((total - sum) / rest) : null };
    })
    .sort((a, b) => a.avgNet - b.avgNet);

  return { days: scored.filter((x) => x.f !== null).length, buckets, tags };
}
