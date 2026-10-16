import "server-only";
import { db } from "../db";
import { randomToken } from "../crypto";

export type CoachMessage = { role: "user" | "assistant"; content: string };
export type CoachChatSummary = { id: string; title: string; note: string | null; commitments: string[]; messageCount: number; updatedAt: string };
export type CoachNote = { title: string; note: string; commitments: string[]; at: string };

export const newChatId = () => `cc_${randomToken(12)}`;
export const isChatId = (id: unknown): id is string => typeof id === "string" && /^cc_[\w-]{8,40}$/.test(id);

type Row = { id: string; title: string; note: string | null; commitments: string[]; messages: CoachMessage[]; noted_count: number; updated_at: Date };

export async function listChats(limit = 30): Promise<CoachChatSummary[]> {
  const sql = await db();
  const rows = await sql<(Omit<Row, "messages"> & { n: number })[]>`
    select id, title, note, commitments, noted_count, updated_at, jsonb_array_length(messages)::int as n
    from coach_chats order by updated_at desc limit ${limit}
  `;
  return rows.map((r) => ({ id: r.id, title: r.title, note: r.note, commitments: r.commitments ?? [], messageCount: r.n, updatedAt: r.updated_at.toISOString() }));
}

export async function getChat(id: string): Promise<{ id: string; title: string; messages: CoachMessage[] } | null> {
  const sql = await db();
  const [row] = await sql<Row[]>`select id, title, messages from coach_chats where id = ${id}`;
  return row ? { id: row.id, title: row.title, messages: row.messages } : null;
}

/** Saves the whole conversation (the client sends the full history each turn). */
export async function saveChat(id: string, messages: CoachMessage[]): Promise<void> {
  const sql = await db();
  const first = messages.find((m) => m.role === "user")?.content ?? "Conversation";
  const title = first.replace(/\s+/g, " ").trim().slice(0, 80) || "Conversation";
  await sql`
    insert into coach_chats (id, title, messages) values (${id}, ${title}, ${sql.json(messages)})
    on conflict (id) do update set messages = excluded.messages, updated_at = now()
  `;
}

export async function deleteChat(id: string): Promise<void> {
  const sql = await db();
  await sql`delete from coach_chats where id = ${id}`;
}

/** Chats whose note is missing or behind the conversation. */
export async function chatsNeedingNotes(limit = 3): Promise<{ id: string; messages: CoachMessage[] }[]> {
  const sql = await db();
  return sql<{ id: string; messages: CoachMessage[] }[]>`
    select id, messages from coach_chats
    where jsonb_array_length(messages) >= 2 and noted_count < jsonb_array_length(messages)
    order by updated_at desc limit ${limit}
  `;
}

export async function needsNote(id: string): Promise<CoachMessage[] | null> {
  const sql = await db();
  const [row] = await sql<{ messages: CoachMessage[]; noted_count: number; note: string | null }[]>`select messages, noted_count, note from coach_chats where id = ${id}`;
  if (!row) return null;
  const n = row.messages.length;
  // First note after the first exchange; then refresh every two exchanges.
  return (row.note === null && n >= 2) || n - row.noted_count >= 4 ? row.messages : null;
}

export async function setNote(id: string, a: { title: string; note: string; commitments: string[]; count: number }): Promise<void> {
  const sql = await db();
  await sql`
    update coach_chats set title = ${a.title.slice(0, 80)}, note = ${a.note.slice(0, 600)}, commitments = ${sql.json(a.commitments.slice(0, 5))}, noted_count = ${a.count}
    where id = ${id}
  `;
}

/** The recent notes a new chat starts from, newest first, never including the current chat. */
export async function recentNotes(excludeId: string | null, limit = 6): Promise<CoachNote[]> {
  const sql = await db();
  const rows = await sql<{ title: string; note: string; commitments: string[]; updated_at: Date }[]>`
    select title, note, commitments, updated_at from coach_chats
    where note is not null and id <> ${excludeId ?? ""}
    order by updated_at desc limit ${limit}
  `;
  return rows.map((r) => ({ title: r.title, note: r.note, commitments: r.commitments ?? [], at: r.updated_at.toISOString().slice(0, 10) }));
}
