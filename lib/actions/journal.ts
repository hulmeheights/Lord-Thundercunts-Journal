"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSession } from "../auth/session";
import { createCapsule, getJournalDay, openCapsule, upsertJournalDay } from "../data/journal";
import { getSettings } from "../data/settings";
import { addDays, todayKey } from "../analytics/time";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Text = z.string().max(20_000).nullable();
const Score = z.number().int().min(1).max(5);

const Patch = z
  .object({
    readiness: z.object({ sleep: Score, energy: Score, focus: Score, mood: Score }).nullable(),
    intention: z.string().max(500).nullable(),
    plan: Text,
    review: Text,
    wins: Text,
    lessons: Text,
    moodAfter: Score.nullable(),
    rulesKept: z.record(z.string().max(64), z.boolean()),
    lifeTags: z.array(z.string().trim().min(1).max(40)).max(20),
    lifeNote: z.string().max(2000).nullable(),
    tasks: z.array(z.object({ id: z.string().max(40), label: z.string().min(1).max(200), done: z.boolean() })).max(50),
  })
  .partial();

export async function saveJournal(day: string, patch: z.input<typeof Patch>) {
  await assertSession();
  const d = Day.parse(day);
  const p = Patch.parse(patch);
  await upsertJournalDay(d, p);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function toggleChecklistItem(day: string, itemId: string, done: boolean) {
  await assertSession();
  const d = Day.parse(day);
  const id = z.string().min(1).max(64).parse(itemId);
  const cur = await getJournalDay(d);
  await upsertJournalDay(d, { checklist: { ...cur.checklist, [id]: Boolean(done) } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function scheduleCapsule(message: string, inDays: number) {
  await assertSession();
  const msg = z.string().trim().min(1).max(4000).parse(message);
  const days = z.number().int().min(1).max(365).parse(inDays);
  const settings = await getSettings();
  await createCapsule(msg, addDays(todayKey(settings.profile.timezone), days));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markCapsuleOpened(id: string) {
  await assertSession();
  await openCapsule(z.string().max(40).parse(id));
  return { ok: true };
}
