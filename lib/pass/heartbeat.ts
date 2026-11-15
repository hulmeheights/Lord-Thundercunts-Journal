/**
 * The TradingView heartbeat. The scripts only speak when there is a trade, so
 * a dead alert looks exactly like a quiet day. Twenty minutes before each
 * session each script now sends a small "I'm running" message; this file knows
 * when one is due, so its absence can be noticed. Pure, so it's unit-tested.
 */
import { zonedToUtc } from "../analytics/time";

const NY = "America/New_York";
export type HbScript = "C" | "SNIPER";
export type HbSession = "ASIA" | "LON" | "NY";

/**
 * When each script's heartbeat lands, in New York minutes of the day (the
 * close of the bar it is sent on), and which evenings / mornings the market
 * is open for it: Asia's is Sunday to Thursday evening, the rest Monday to Friday.
 */
export const HB_SLOTS: Record<HbScript, { session: HbSession; minute: number; days: number[] }[]> = {
  C: [
    { session: "ASIA", minute: 19 * 60 + 41, days: [0, 1, 2, 3, 4] },
    { session: "LON", minute: 3 * 60 + 11, days: [1, 2, 3, 4, 5] },
    { session: "NY", minute: 9 * 60 + 51, days: [1, 2, 3, 4, 5] },
  ],
  SNIPER: [{ session: "NY", minute: 9 * 60 + 30, days: [1, 2, 3, 4, 5] }],
};
export const HB_NAME: Record<HbSession, string> = { ASIA: "Asia", LON: "London", NY: "New York" };
/** A heartbeat may arrive a little before its slot (clock drift) and counts for it. */
const EARLY_MS = 3 * 60_000;
/** How long after a slot the heartbeat is given before it counts as missed, and how long the alarm stays worth raising. */
export const GRACE_MS = 5 * 60_000;
export const ALARM_MS = 50 * 60_000;

const nyDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: NY, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

/** The most recent heartbeat that was due at or before `now` (looking back a week, across the weekend). */
export function lastDue(script: HbScript, now: Date): { session: HbSession; at: Date } | null {
  let best: { session: HbSession; at: Date } | null = null;
  const today = new Date(`${nyDay(now)}T12:00:00Z`);
  for (let back = 0; back <= 7; back++) {
    const d = new Date(today.getTime() - back * 86_400_000);
    const day = d.toISOString().slice(0, 10);
    for (const s of HB_SLOTS[script]) {
      if (!s.days.includes(d.getUTCDay())) continue;
      const at = zonedToUtc(day, s.minute, NY);
      if (at.getTime() <= now.getTime() && (!best || at.getTime() > best.at.getTime())) best = { session: s.session, at };
    }
    if (best) break; // days are walked newest first: the first day with a due slot holds the latest one
  }
  return best;
}

export type HbState = "alive" | "waiting" | "missed" | "never";
/**
 * Is the script's alert alive? `never`: no heartbeat has ever come (the old
 * script is still on the chart). `waiting`: one is due this minute. `missed`:
 * the last one that was due did not arrive.
 */
export function hbState(script: HbScript, lastBeat: Date | null, now: Date): { state: HbState; due: { session: HbSession; at: Date } | null } {
  const due = lastDue(script, now);
  if (!lastBeat) return { state: "never", due };
  if (!due || lastBeat.getTime() >= due.at.getTime() - EARLY_MS) return { state: "alive", due };
  return { state: now.getTime() - due.at.getTime() < GRACE_MS ? "waiting" : "missed", due };
}

/** Missed, and recent enough that telling you still helps (not hours later, when the session is long gone). */
export function hbAlarm(script: HbScript, lastBeat: Date | null, now: Date): { session: HbSession; at: Date } | null {
  const { state, due } = hbState(script, lastBeat, now);
  return state === "missed" && due && now.getTime() - due.at.getTime() <= ALARM_MS ? due : null;
}
