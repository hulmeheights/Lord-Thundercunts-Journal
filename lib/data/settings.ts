import "server-only";
import { cache } from "react";
import { db } from "../db";
import type { Settings } from "../types";
import { DEFAULT_SETTINGS } from "../defaults";

type Key = keyof Settings;

export const getSettings = cache(async (): Promise<Settings> => {
  const sql = await db();
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from app_settings`;
  const out = structuredClone(DEFAULT_SETTINGS) as Settings;
  for (const r of rows) {
    const k = r.key as Key;
    if (!(k in out) || r.value === null || typeof r.value !== "object") continue;
    if (Array.isArray(r.value)) {
      (out as Record<Key, unknown>)[k] = r.value;
    } else {
      (out as Record<Key, unknown>)[k] = { ...(out[k] as object), ...(r.value as object) };
    }
  }
  return out;
});

export async function saveSetting<K extends Key>(key: K, value: Settings[K]): Promise<void> {
  const sql = await db();
  await sql`
    insert into app_settings (key, value) values (${key}, ${sql.json(value as never)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}
