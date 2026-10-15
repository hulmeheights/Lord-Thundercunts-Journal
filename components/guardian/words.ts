import type { PropSettings } from "@/lib/types";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** Small counts read better as words in a serif sentence ("four more days"). */
export function countWord(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n]! : n.toLocaleString("en-US");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-08-10" → "Aug 10". */
export function shortDay(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}`;
}

/** "2026-08" → "Aug 26" (axis) or "August 2026" (heading). */
export function monthLabel(month: string, long = false): string {
  const [y, m] = month.split("-").map(Number);
  return long ? `${MONTHS_LONG[(m ?? 1) - 1]} ${y}` : `${MONTHS[(m ?? 1) - 1]} ${String(y).slice(2)}`;
}

/** "Topstep 50K Combine" / "Lucid $75k Funded". */
export function accountName(prop: PropSettings): string {
  const size = prop.preset === "custom" ? `$${Math.round(prop.startBalance / 1000)}K` : prop.preset;
  return `${prop.firm || "Prop"} ${size} ${prop.phase === "combine" ? "Combine" : "Funded"}`;
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}`;
}
