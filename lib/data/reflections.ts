import "server-only";
import { db } from "../db";
import { decryptJson, encryptJson, randomToken, sha256 } from "../crypto";
import type { Reflection } from "../ai/briefing";
import { getJournalDay } from "./journal";
import { getSettings } from "./settings";
import { listTrades } from "./trades";
import { addDays, dayKey, timeInTz } from "../analytics/time";

/** A coach reflection, kept so you can read it back later. */
export type SavedReflection = {
  id: string;
  day: string;
  createdAt: string;
  reflection: Reflection;
  /** False once the entry or the day's trades have changed since it was written. */
  current: boolean;
};

/**
 * What the coach reads for a day: the journal entry and that day's trades.
 * Its hash tells a saved reflection whether the page has changed since.
 */
export async function reflectionContext(day: string): Promise<{ context: Record<string, unknown>; hash: string }> {
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const [journal, trades] = await Promise.all([
    getJournalDay(day),
    listTrades({ since: new Date(`${addDays(day, -1)}T00:00:00Z`), until: new Date(`${addDays(day, 2)}T00:00:00Z`) }),
  ]);
  const dayTrades = trades.filter((t) => dayKey(t.exitTime, tz) === day);
  const context = {
    day,
    journal: {
      readiness: journal.readiness,
      intention: journal.intention,
      plan: journal.plan,
      review: journal.review,
      wins: journal.wins,
      lessons: journal.lessons,
      moodAfter: journal.moodAfter,
      lifeTags: journal.lifeTags,
      lifeNote: journal.lifeNote,
    },
    trades: dayTrades.map((t) => ({
      time: timeInTz(t.entryTime, tz), symbol: t.root, dir: t.direction, qty: t.qty, net: Math.round(t.netPnl),
      setups: t.setups, mistakes: t.mistakes, emotion: t.emotion, note: t.notes?.slice(0, 160) ?? null,
    })),
    net: Math.round(dayTrades.reduce((s, t) => s + t.netPnl, 0)),
  };
  return { context, hash: sha256(JSON.stringify(context)) };
}

type Row = { id: string; day: string; created_at: Date; body_enc: string; basis_hash: string };

/** Encrypted at rest (bound to its id), like the photos: it's written about your private life. */
export async function saveReflection(day: string, reflection: Reflection, hash: string): Promise<SavedReflection> {
  const sql = await db();
  const id = `ref_${randomToken(12)}`;
  const [r] = await sql<Row[]>`
    insert into journal_reflections (id, day, body_enc, basis_hash)
    values (${id}, ${day}, ${encryptJson(reflection, `reflection:${id}`)}, ${hash})
    returning id, day, created_at, body_enc, basis_hash
  `;
  return { id: r!.id, day: r!.day, createdAt: r!.created_at.toISOString(), reflection, current: true };
}

/** A day's reflections, newest first, each marked current or not against the page as it is now. */
export async function listReflections(day: string, currentHash: string): Promise<SavedReflection[]> {
  const sql = await db();
  const rows = await sql<Row[]>`select id, day, created_at, body_enc, basis_hash from journal_reflections where day = ${day} order by created_at desc limit 50`;
  const out: SavedReflection[] = [];
  for (const r of rows) {
    try {
      out.push({ id: r.id, day: r.day, createdAt: r.created_at.toISOString(), reflection: decryptJson<Reflection>(r.body_enc, `reflection:${r.id}`), current: r.basis_hash === currentHash });
    } catch {
      // Written under another ENCRYPTION_KEY: it can't be read, so it isn't shown.
    }
  }
  return out;
}

export async function deleteReflection(id: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`delete from journal_reflections where id = ${id} returning id`;
  return rows.length > 0;
}
