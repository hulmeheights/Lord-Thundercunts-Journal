import "server-only";
import { db } from "../db";
import { buildDossier, observerName, type ObserverDossier, type ObstacleKey, type PerceptionGap } from "../analytics/observer";
import { evaluateRules } from "../analytics/rules";
import { detectTilt } from "../analytics/tilt";
import { addDays, dayKey, todayKey } from "../analytics/time";
import type { ObserverCaseFile } from "../ai/observer";
import type { Settings } from "../types";
import { listJournalDays } from "./journal";
import { getSettings } from "./settings";
import { listTrades } from "./trades";

export const OBSERVER_WINDOWS = [30, 90] as const;
export type ObserverWindow = (typeof OBSERVER_WINDOWS)[number];

/** Builds the Observer's evidence dossier over the last `windowDays` days. */
export async function loadDossier(
  windowDays: ObserverWindow = 30,
  statedWant: string | null = null,
): Promise<{ settings: Settings; dossier: ObserverDossier; today: string }> {
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const today = todayKey(tz);
  const from = addDays(today, -(windowDays - 1));
  const [trades, journals] = await Promise.all([
    listTrades({ since: new Date(`${addDays(from, -1)}T00:00:00Z`), until: new Date(`${addDays(today, 2)}T00:00:00Z`) }),
    listJournalDays(from, today),
  ]);
  const inWindow = trades.filter((t) => {
    const d = dayKey(t.exitTime, tz);
    return d >= from && d <= today;
  });
  const dossier = buildDossier({
    name: observerName(settings.profile.name, settings.observer.name),
    trades: inWindow,
    journals,
    rules: evaluateRules(inWindow, settings.rules, tz),
    tilt: detectTilt(inWindow, tz),
    settings,
    tz,
    from,
    to: today,
    statedWant,
  });
  return { settings, dossier, today };
}

/** What the dossier said when the session was written — so progress can be measured later. */
export type ObserverSnapshot = {
  headline: string;
  sample: { trades: number; days: number };
  top: { key: ObstacleKey; title: string; cost: number }[];
};

export type ObserverSession = {
  id: string;
  createdAt: string;
  day: string;
  from: string;
  to: string;
  wants: string | null;
  doing: string | null;
  stopping: string | null;
  advice: string | null;
  believed: ObstacleKey[];
  snapshot: ObserverSnapshot;
  gap: Pick<PerceptionGap, "verdict" | "message"> | null;
  ai: ObserverCaseFile | null;
  adopted: ObstacleKey[];
};

type Row = {
  id: string; created_at: Date; day: string; window_from: string; window_to: string; wants: string | null; doing: string | null;
  stopping: string | null; advice: string | null; believed: string[]; snapshot: ObserverSnapshot;
  gap: ObserverSession["gap"]; ai: ObserverCaseFile | null; adopted: string[];
};

function toSession(r: Row): ObserverSession {
  return {
    id: r.id,
    createdAt: r.created_at.toISOString(),
    day: r.day,
    from: r.window_from,
    to: r.window_to,
    wants: r.wants,
    doing: r.doing,
    stopping: r.stopping,
    advice: r.advice,
    believed: r.believed as ObstacleKey[],
    snapshot: r.snapshot,
    gap: r.gap,
    ai: r.ai,
    adopted: r.adopted as ObstacleKey[],
  };
}

export async function listObserverSessions(limit = 20): Promise<ObserverSession[]> {
  const sql = await db();
  const rows = await sql<Row[]>`select * from observer_sessions order by created_at desc limit ${limit}`;
  return rows.map(toSession);
}

export async function getObserverSession(id: string): Promise<ObserverSession | null> {
  const sql = await db();
  const [row] = await sql<Row[]>`select * from observer_sessions where id = ${id}`;
  return row ? toSession(row) : null;
}

export async function insertObserverSession(s: Omit<ObserverSession, "createdAt" | "ai" | "adopted">): Promise<void> {
  const sql = await db();
  await sql`
    insert into observer_sessions (id, day, window_from, window_to, wants, doing, stopping, advice, believed, snapshot, gap)
    values (
      ${s.id}, ${s.day}, ${s.from}, ${s.to}, ${s.wants}, ${s.doing}, ${s.stopping}, ${s.advice},
      ${sql.array(s.believed)}::text[], ${sql.json(s.snapshot as never)}, ${s.gap ? sql.json(s.gap as never) : null}
    )
  `;
}

export async function saveObserverAi(id: string, ai: ObserverCaseFile): Promise<void> {
  const sql = await db();
  await sql`update observer_sessions set ai = ${sql.json(ai as never)} where id = ${id}`;
}

export async function markAdopted(id: string, key: ObstacleKey): Promise<void> {
  const sql = await db();
  await sql`
    update observer_sessions set adopted = array_append(adopted, ${key})
    where id = ${id} and not (${key} = any(adopted))
  `;
}

export async function deleteObserverSession(id: string): Promise<void> {
  const sql = await db();
  await sql`delete from observer_sessions where id = ${id}`;
}
