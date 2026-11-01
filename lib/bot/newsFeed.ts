import "server-only";
import { db } from "../db";
import { parseFeed, type NewsEvent } from "./news";

const FEED = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

/** Refresh this week's high-impact US releases (at most every 3 hours). Never throws. */
export async function refreshNews(force = false): Promise<void> {
  const sql = await db();
  try {
    const [last] = await sql<{ at: Date }[]>`select max(fetched_at) as at from bot_news`;
    if (!force && last?.at && Date.now() - last.at.getTime() < 3 * 60 * 60_000) return;
    const r = await fetch(FEED, { signal: AbortSignal.timeout(8000), cache: "no-store", headers: { Accept: "application/json" } });
    if (!r.ok) return;
    const events = parseFeed(await r.json());
    if (!events.length) return;
    await sql.begin(async (tx) => {
      for (const e of events) {
        await tx`insert into bot_news (at, title, fetched_at) values (${e.at}, ${e.title}, now()) on conflict (at, title) do update set fetched_at = now()`;
      }
    });
  } catch {
    // The last calendar we have keeps counting; a missed refresh isn't a failure.
  }
}

/** Releases around a moment (from the stored calendar). */
export async function newsAround(from: Date, to: Date): Promise<NewsEvent[]> {
  const sql = await db();
  const rows = await sql<{ at: Date; title: string }[]>`select at, title from bot_news where at between ${from} and ${to} order by at`;
  return rows.map((r) => ({ title: r.title, at: r.at.toISOString() }));
}

/** When the calendar was last refreshed. */
export async function newsFreshness(): Promise<Date | null> {
  const sql = await db();
  const [r] = await sql<{ at: Date | null }[]>`select max(fetched_at) as at from bot_news`;
  return r?.at ?? null;
}
