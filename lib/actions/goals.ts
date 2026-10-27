"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSession } from "../auth/session";
import { listGoals, insertGoal, insertStep, removeGoal, removeStep, restartGoalFrom, setGoalDone, setRewardClaimed } from "../data/goals";
import { checkGoal, describeMeasure, type GoalMeasure } from "../analytics/goalcheck";
import { listTrades } from "../data/trades";
import { listLedger } from "../data/ledger";
import { saveSetting } from "../data/settings";
import { getSettings } from "../data/settings";
import { addDays, todayKey } from "../analytics/time";

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
const Id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,40}$`));
const done = () => revalidatePath("/journal");

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times are HH:MM");
const Count = z.number().int().min(1).max(500);
const Money = z.number().min(1).max(10_000_000);
const Rule = z.discriminatedUnion("type", [
  z.object({ type: z.literal("window"), start: HHMM, end: HHMM }).refine((r) => r.start !== r.end, "The window needs a start and an end"),
  z.object({ type: z.literal("maxTrades"), n: Count }),
  z.object({ type: z.literal("maxDayLoss"), amount: Money }),
  z.object({ type: z.literal("stopAfterLosses"), n: Count }),
  z.object({ type: z.literal("maxLossPerTrade"), amount: Money }),
  z.object({ type: z.literal("maxContracts"), n: Count }),
  z.object({ type: z.literal("cooldown"), minutes: z.number().int().min(1).max(600) }),
  z.object({ type: z.literal("noRevenge") }),
  z.object({ type: z.literal("greenDay") }),
  z.object({ type: z.literal("myRules") }),
]);
const Measure = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("days"),
      rules: z.array(Rule).min(1, "Pick at least one rule").max(10),
      span: z.enum(["weeks", "until", "inARow", "total"]),
      n: z.number().int().min(1).max(365),
      until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .refine((m) => m.span !== "until" || !!m.until, "Pick the end date"),
  z.object({ kind: z.literal("total"), metric: z.enum(["net", "paidOut", "payouts", "evalsPassed"]), target: Money }),
  z.object({ kind: z.literal("rate"), metric: z.enum(["winRate", "greenDays"]), target: z.number().min(1).max(100), over: Count }),
]);

export async function addGoal(input: {
  title: string;
  why?: string | null;
  targetDay?: string | null;
  reward?: string | null;
  kind?: "trading" | "life";
  measure?: GoalMeasure | null;
}) {
  await assertSession();
  const v = z
    .object({
      title: z.string().transform(clean).pipe(z.string().max(160)),
      why: z.string().nullish().transform((s) => (s ? clean(s).slice(0, 1000) || null : null)),
      targetDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform((s) => s ?? null),
      reward: z.string().nullish().transform((s) => (s ? clean(s).slice(0, 160) || null : null)),
      kind: z.enum(["trading", "life"]).default("life"),
      measure: Measure.nullish().transform((m) => (m ?? null) as GoalMeasure | null),
    })
    .safeParse(input);
  if (!v.success) return { error: v.error.issues[0]?.message ?? "Check the goal." };
  const measure = v.data.kind === "trading" ? v.data.measure : null;
  // A measured goal can name itself from its rules.
  const title = v.data.title || (measure ? describeMeasure(measure) : "");
  if (!title) return { error: "What's the goal?" };
  const settings = await getSettings();
  await insertGoal({ ...v.data, title, measure, startedOn: todayKey(settings.profile.timezone) });
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

/** A broken measured goal starts counting again from today. */
export async function restartGoal(goalId: string) {
  await assertSession();
  const id = Id("goal").parse(goalId);
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const today = todayKey(tz);
  // If today's own trades already broke it, a restart from today would be broken on day one: start tomorrow.
  const goal = (await listGoals()).find((g) => g.id === id);
  let from = today;
  if (goal?.measure) {
    const [trades, ledger] = await Promise.all([listTrades({ since: new Date(`${addDays(today, -1)}T00:00:00Z`) }), listLedger()]);
    if (checkGoal(goal.measure, today, goal.targetDay, { trades, ledger, rules: settings.rules, tz, today }).status === "broken") from = addDays(today, 1);
  }
  await restartGoalFrom(id, from);
  done();
  return { ok: true };
}

export async function claimReward(goalId: string, claimed: boolean) {
  await assertSession();
  await setRewardClaimed(Id("goal").parse(goalId), z.boolean().parse(claimed));
  done();
  return { ok: true };
}

/** Name the mission. Naming it for the first time starts the clock on it. */
export async function setMission(name: string) {
  await assertSession();
  const mission = z.string().transform(clean).pipe(z.string().min(1).max(80)).parse(name);
  const settings = await getSettings();
  const missionStart = settings.goals.missionStart ?? todayKey(settings.profile.timezone);
  await saveSetting("goals", { ...settings.goals, mission, missionStart });
  done();
  return { ok: true };
}

/** Which rules make a day clean for the mission. */
export async function setMissionCounts(counts: unknown) {
  await assertSession();
  const v = z.array(z.enum(["session", "maxTrades", "maxDailyLoss", "stopAfterLosses"])).min(1, "Keep at least one rule").max(4).safeParse(counts);
  if (!v.success) return { error: v.error.issues[0]?.message ?? "Check the rules." };
  const settings = await getSettings();
  await saveSetting("goals", { ...settings.goals, counts: [...new Set(v.data)] });
  done();
  return { ok: true };
}
