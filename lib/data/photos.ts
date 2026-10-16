import "server-only";
import { db } from "../db";
import { decryptBytes, encryptBytes, randomToken } from "../crypto";

export type JournalPhoto = { id: string; day: string; caption: string | null; width: number; height: number; bytes: number; createdAt: string };
export type PhotoMime = "image/webp" | "image/jpeg" | "image/png";

export const MAX_PHOTO_BYTES = 3_500_000; // under Vercel's 4.5 MB request limit, after the browser has shrunk it
export const MAX_PHOTOS_PER_DAY = 24;

const purpose = (id: string) => `photo:${id}`;

/** Trust the bytes, not the browser's label: only real WebP, JPEG or PNG files are kept. */
export function sniffMime(b: Buffer): PhotoMime | null {
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

type Row = { id: string; day: string; caption: string | null; width: number; height: number; bytes: number; created_at: Date };
const toPhoto = (r: Row): JournalPhoto => ({ id: r.id, day: r.day, caption: r.caption, width: r.width, height: r.height, bytes: r.bytes, createdAt: r.created_at.toISOString() });

export async function listPhotos(day: string): Promise<JournalPhoto[]> {
  const sql = await db();
  const rows = await sql<Row[]>`select id, day, caption, width, height, bytes, created_at from journal_photos where day = ${day} order by created_at`;
  return rows.map(toPhoto);
}

/** Photo counts per day in a range, for the journal's lists. */
export async function photoCounts(from: string, to: string): Promise<Map<string, number>> {
  const sql = await db();
  const rows = await sql<{ day: string; n: number }[]>`select day, count(*)::int as n from journal_photos where day between ${from} and ${to} group by day`;
  return new Map(rows.map((r) => [r.day, r.n]));
}

export async function addPhoto(a: { day: string; caption: string | null; mime: PhotoMime; width: number; height: number; data: Buffer }): Promise<JournalPhoto> {
  const sql = await db();
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from journal_photos where day = ${a.day}`;
  if (n >= MAX_PHOTOS_PER_DAY) throw new Error(`A day holds up to ${MAX_PHOTOS_PER_DAY} photos.`);
  const id = `ph_${randomToken(12)}`;
  const [row] = await sql<Row[]>`
    insert into journal_photos (id, day, caption, mime, width, height, bytes, data_enc)
    values (${id}, ${a.day}, ${a.caption}, ${a.mime}, ${a.width}, ${a.height}, ${a.data.length}, ${encryptBytes(a.data, purpose(id))})
    returning id, day, caption, width, height, bytes, created_at
  `;
  return toPhoto(row!);
}

export async function readPhoto(id: string): Promise<{ mime: PhotoMime; data: Buffer } | null> {
  const sql = await db();
  const [row] = await sql<{ mime: PhotoMime; data_enc: Buffer }[]>`select mime, data_enc from journal_photos where id = ${id}`;
  if (!row) return null;
  return { mime: row.mime, data: decryptBytes(Buffer.from(row.data_enc), purpose(id)) };
}

export async function setCaption(id: string, caption: string | null): Promise<void> {
  const sql = await db();
  await sql`update journal_photos set caption = ${caption} where id = ${id}`;
}

export async function deletePhoto(id: string): Promise<void> {
  const sql = await db();
  await sql`delete from journal_photos where id = ${id}`;
}
