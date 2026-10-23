"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSession } from "../auth/session";
import { insertGoal, insertStep, removeGoal, removeStep, setGoalDone, setRewardClaimed } from "../data/goals";
import { saveSetting } from "../data/settings";
import { getSettings } from "../data/settings";
import { todayKey } from "../analytics/time";

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
const Id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,40}$`));
const done = () => revalidatePath("/journal");

export async function addGoal(input: { title: string; why?: string | null; targetDay?: string | null; reward?: string | null }) {
  await assertSession();
  const v = z
    .object({
      title: z.string().transform(clean).pipe(z.string().min(1, "What's the goal?").max(160)),
      why: z.string().nullish().transform((s) => (s ? clean(s).slice(0, 1000) || null : null)),
      targetDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform((s) => s ?? null),
      reward: z.string().nullish().transform((s) => (s ? clean(s).slice(0, 160) || null : null)),
    })
    .safeParse(input);
  if (!v.success) return { error: v.error.issues[0]?.message ?? "Check the goal." };
  await insertGoal(v.data);
  done();
  return { ok: true };
}

export async function addStep(goalId: string, text: string) {
  await assertSession();
  const t = z.string().transform(clean).pipe(z.string().min(1).max(500)).safeParse(text);
  if (!t.success) return { error: "Write what you did." };
  const settings = await getSettings();
  await insertStep(Id("goal").parse(goalId), todayKey(settings.profile.timezone), t.data);
  done();
  return { ok: true };
}

export async function markGoal(goalId: string, achieved: boolean) {
  await assertSession();
  await setGoalDone(Id("goal").parse(goalId), z.boolean().parse(achieved));
  done();
  return { ok: true };
}

export async function deleteGoal(goalId: string) {
  await assertSession();
  await removeGoal(Id("goal").parse(goalId));
  done();
  return { ok: true };
}

export async function deleteStep(stepId: string) {
  await assertSession();
  await removeStep(Id("step").parse(stepId));
  done();
  return { ok: true };
}

export async function claimReward(goalId: string, claimed: boolean) {
  await assertSession();
  await setRewardClaimed(Id("goal").parse(goalId), z.boolean().parse(claimed));
  done();
  return { ok: true };
}

/** Tree, stars or rocket: how your progress is drawn. */
export async function setGoalsTheme(theme: string) {
  await assertSession();
  await saveSetting("goals", { theme: z.enum(["tree", "stars", "rocket"]).parse(theme) });
  done();
  return { ok: true };
}
