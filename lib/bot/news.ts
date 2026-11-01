/**
 * The news blackout: no new Autopilot entries from N minutes before to N
 * minutes after a high-impact US release (CPI, NFP, FOMC, PPI…). The
 * calendar is Forex Factory's free weekly feed, refreshed by the hourly job.
 * Pure parts here are tested; fetching lives in newsFeed.ts.
 */
export type NewsEvent = { title: string; at: string };

type FeedItem = { title?: string; country?: string; date?: string; impact?: string };
/**
 * High-impact US events with a real release time. All-day items (an election,
 * a holiday) come through with odd times like 10:16, so only times on a
 * 5-minute mark count.
 */
export function parseFeed(items: unknown): NewsEvent[] {
  if (!Array.isArray(items)) return [];
  const out: NewsEvent[] = [];
  for (const it of items as FeedItem[]) {
    if (it?.country !== "USD" || it.impact !== "High" || !it.date || !it.title) continue;
    const at = new Date(it.date);
    if (Number.isNaN(at.getTime()) || at.getUTCMinutes() % 5 !== 0 || at.getUTCSeconds() !== 0) continue;
    out.push({ title: it.title.slice(0, 120), at: at.toISOString() });
  }
  return out;
}

/** The event(s) blocking a moment, if it falls within `minutes` either side of one. */
export function newsBlock(now: Date, events: readonly NewsEvent[], minutes: number): NewsEvent[] {
  const ms = minutes * 60_000;
  return events.filter((e) => Math.abs(now.getTime() - Date.parse(e.at)) <= ms);
}

/** Releases at the same minute (NFP + unemployment + earnings) shown as one window. */
export function windows(events: readonly NewsEvent[], minutes: number): { at: string; titles: string[]; from: string; to: string }[] {
  const by = new Map<string, string[]>();
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) by.set(e.at, [...(by.get(e.at) ?? []), e.title]);
  return [...by].map(([at, titles]) => ({ at, titles, from: new Date(Date.parse(at) - minutes * 60_000).toISOString(), to: new Date(Date.parse(at) + minutes * 60_000).toISOString() }));
}
