import "server-only";
import { db } from "../db";
import { randomToken } from "../crypto";
import type { Capsule, DayTask, JournalDay, Readiness } from "../types";

type JournalRow = {
  day: string; checklist: Record<string, boolean>; tasks: DayTask[]; readiness: Readiness | null;
  intention: string | null; plan: string | null; review: string | null; wins: string | null; lessons: string | null;
  mood_after: number | null; rules_kept: Record<string, boolean>; is_sample: boolean;
};

function rowToDay(r: JournalRow): JournalDay {
  return {
    day: r.day,
    checklist: r.checklist ?? {},
    tasks: Array.isArray(r.tasks) ? r.tasks : [],
    readiness: r.readiness ?? null,
    intention: r.intention,
    plan: r.plan,
    review: r.review,
    wins: r.wins,
    lessons: r.lessons,
    moodAfter: r.mood_after,
    rulesKept: r.rules_kept ?? {},
    isSample: r.is_sample,
  };
}

export function emptyDay(day: string): JournalDay {
  return {
    day, checklist: {}, tasks: [], readiness: null, intention: null, plan: null, review: null, wins: null,
    lessons: null, moodAfter: null, rulesKept: {}, isSample: false,
  };
}

export async function getJournalDay(day: string): Promise<JournalDay> {
  const sql = await db();
  const rows = await sql<JournalRow[]>`select * from journal_days where day = ${day}`;
  return rows[0] ? rowToDay(rows[0]) : emptyDay(day);
}

export async function listJournalDays(from: string, to: string): Promise<JournalDay[]> {
  const sql = await db();
  const rows = await sql<JournalRow[]>`select * from journal_days where day >= ${from} and day <= ${to} order by day`;
  return rows.map(rowToDay);
}

export type JournalPatch = Partial<Omit<JournalDay, "day" | "isSample">>;

export async function upsertJournalDay(day: string, patch: JournalPatch): Promise<JournalDay> {
  const sql = await db();
  const cur = await getJournalDay(day);
  const n = { ...cur, ...patch };
  await sql`
    insert into journal_days (day, checklist, tasks, readiness, intention, plan, review, wins, lessons, mood_after, rules_kept, is_sample)
    values (
      ${day}, ${sql.json(n.checklist)}, ${sql.json(n.tasks as never)}, ${n.readiness ? sql.json(n.readiness) : null},
      ${n.intention}, ${n.plan}, ${n.review}, ${n.wins}, ${n.lessons}, ${n.moodAfter}, ${sql.json(n.rulesKept)}, false
    )
    on conflict (day) do update set
      checklist = excluded.checklist, tasks = excluded.tasks, readiness = excluded.readiness,
      intention = excluded.intention, plan = excluded.plan, review = excluded.review, wins = excluded.wins,
      lessons = excluded.lessons, mood_after = excluded.mood_after, rules_kept = excluded.rules_kept,
      is_sample = false, updated_at = now()
  `;
  return { ...n, isSample: false };
}

export async function insertSampleJournalDays(days: JournalDay[]): Promise<void> {
  const sql = await db();
  for (const n of days) {
    await sql`
      insert into journal_days (day, checklist, tasks, readiness, intention, plan, review, wins, lessons, mood_after, rules_kept, is_sample)
      values (
        ${n.day}, ${sql.json(n.checklist)}, ${sql.json(n.tasks as never)}, ${n.readiness ? sql.json(n.readiness) : null},
        ${n.intention}, ${n.plan}, ${n.review}, ${n.wins}, ${n.lessons}, ${n.moodAfter}, ${sql.json(n.rulesKept)}, true
      )
      on conflict (day) do nothing
    `;
  }
}

/** Days that have a written entry (for the journal calendar dots). */
export async function journaledDays(from: string, to: string): Promise<string[]> {
  const sql = await db();
  const rows = await sql<{ day: string }[]>`
    select day from journal_days
    where day >= ${from} and day <= ${to}
      and (coalesce(length(review), 0) + coalesce(length(plan), 0) + coalesce(length(lessons), 0) + coalesce(length(wins), 0)) > 0
  `;
  return rows.map((r) => r.day);
}

// ── Time capsules ────────────────────────────────────────────────────────────

type CapsuleRow = { id: string; message: string; created_at: Date; deliver_on: string; opened_at: Date | null };

const toCapsule = (r: CapsuleRow): Capsule => ({
  id: r.id,
  message: r.message,
  createdAt: r.created_at.toISOString(),
  deliverOn: r.deliver_on,
  openedAt: r.opened_at?.toISOString() ?? null,
});

export async function createCapsule(message: string, deliverOn: string): Promise<void> {
  const sql = await db();
  await sql`insert into capsules (id, message, deliver_on) values (${randomToken(12)}, ${message}, ${deliverOn})`;
}

export async function dueCapsules(today: string): Promise<Capsule[]> {
  const sql = await db();
  const rows = await sql<CapsuleRow[]>`
    select * from capsules where deliver_on <= ${today} order by (opened_at is null) desc, deliver_on desc limit 20
  `;
  return rows.map(toCapsule);
}

export async function pendingCapsuleCount(today: string): Promise<number> {
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from capsules where deliver_on > ${today}`;
  return r?.n ?? 0;
}

export async function openCapsule(id: string): Promise<void> {
  const sql = await db();
  await sql`update capsules set opened_at = coalesce(opened_at, now()) where id = ${id}`;
}
