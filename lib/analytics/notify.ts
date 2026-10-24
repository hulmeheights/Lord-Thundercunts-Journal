/**
 * What the phone says, and when. Pure, so the wording and the timing are tested.
 * The cron calls in twice a day; each reminder goes at most once per day.
 */
import { fmtMinute, weekdayIndex } from "./time";
import type { MissionDay } from "./mission";

export type Reminder = { kind: "pre" | "evening"; title: string; body: string; url: string };

const money = (n: number) => `${n < 0 ? "−" : "+"}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Before the window opens on a weekday: when it opens, your plan, your streak. */
export function preSession(input: { day: string; minute: number; sessionStart: number | null; plan: string | null; streak: number; mission: string }): Reminder | null {
  if (weekdayIndex(input.day) >= 5) return null;
  const open = input.sessionStart;
  if (open !== null && input.minute >= open) return null;
  const lines = [open !== null ? `Your window opens at ${fmtMinute(open)}. Nothing before it.` : "Trade your window, not the screen."];
  if (input.plan?.trim()) lines.push(`Plan: ${clip(input.plan.trim().replace(/\s+/g, " "), 90)}`);
  lines.push(input.streak > 0 ? `${input.streak} clean day${input.streak === 1 ? "" : "s"} in a row. Keep the engine lit.` : `Today can be day one of the streak.`);
  return { kind: "pre", title: clip(`Mission · ${input.mission}`, 60), body: lines.join("\n"), url: "/" };
}

/** After the close: how today counted, and a nudge if nothing is written. */
export function evening(input: { day: string; minute: number; sessionEnd: number | null; today: MissionDay | undefined; streak: number; journaled: boolean }): Reminder | null {
  const end = input.sessionEnd ?? 16 * 60;
  if (input.minute < end) return null;
  const d = input.today;
  if (!d && weekdayIndex(input.day) >= 5) return null;
  const write = input.journaled ? "" : " Two minutes in the journal while it's fresh?";
  if (!d || d.kind === "hold") return { kind: "evening", title: "Sat out · altitude held", body: `No trades today. That still counts.${write}`, url: `/journal/${input.day}` };
  if (d.kind === "burn") {
    return {
      kind: "evening",
      title: `Clean day · ${money(d.net)}`,
      body: `${d.trades} trade${d.trades === 1 ? "" : "s"}, all inside your rules. ${input.streak} clean in a row.${write}`,
      url: `/journal/${input.day}`,
    };
  }
  return {
    kind: "evening",
    title: `Fuel leaked · ${money(d.net)}`,
    body: `${d.reasons.join(", ").replace(/^./, (c) => c.toUpperCase())}. One day doesn't end the mission; tomorrow is a fresh burn.${write}`,
    url: `/journal/${input.day}`,
  };
}
