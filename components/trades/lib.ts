import type { Trade } from "@/lib/types";
import { MONTHS, WEEKDAYS, weekdayIndex } from "@/lib/analytics/time";

/** "2026-10-15" → "Thu 15 Oct" (render uppercase via CSS). */
export function dayLabel(day: string): string {
  const d = Number(day.slice(8, 10));
  const m = MONTHS[Number(day.slice(5, 7)) - 1]!.slice(0, 3);
  return `${WEEKDAYS[weekdayIndex(day)]} ${d} ${m}`;
}

/** Points captured in the trade's favour (negative when it went against you). */
export function pointsFor(t: Pick<Trade, "direction" | "entryPrice" | "exitPrice">): number {
  return t.direction === "long" ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice;
}

/** A direct image for a chart link: image URLs as-is, TradingView /x/ links as their snapshot PNG. */
export function chartImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(url)) return url;
  const tv = /tradingview\.com\/x\/([A-Za-z0-9]+)/.exec(url);
  if (tv) return `https://s3.tradingview.com/snapshots/${tv[1]![0]!.toLowerCase()}/${tv[1]}.png`;
  return null;
}

export const RATING_WORDS = ["", "Poor", "Sloppy", "Fair", "Clean", "Textbook"] as const;

export function sourceLabel(source: string): string {
  if (source === "topstepx") return "TopstepX";
  if (source === "tradovate") return "Tradovate";
  if (source === "sample") return "Sample";
  if (source === "manual") return "Manual";
  if (source === "import") return "Imported";
  return source.replace(/^projectx-/, "").replace(/^\w/, (c) => c.toUpperCase());
}

/** Minutes → a figure + unit pair for big stats ("7" min, "1:05" hrs, "45" sec). */
export function holdParts(min: number): { value: string; unit: string } {
  if (min < 1) return { value: String(Math.max(1, Math.round(min * 60))), unit: "sec" };
  if (min < 60) return { value: String(Math.round(min)), unit: "min" };
  const h = Math.floor(min / 60);
  return { value: `${h}:${String(Math.round(min % 60)).padStart(2, "0")}`, unit: "hrs" };
}

const SMALL = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** Spell out small numbers for literary sentences. */
export function spell(n: number): string {
  return SMALL[n] ?? String(n);
}
