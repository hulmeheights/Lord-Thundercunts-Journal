import "server-only";
import { db } from "../db";
import { randomToken } from "../crypto";

export type GoalStep = { id: string; day: string; text: string; createdAt: string };
export type Goal = {
  id: string;
  title: string;
  why: string | null;
  targetDay: string | null;
  createdAt: string;
  completedAt: string | null;
  /** What you earn when it's reached. */
  reward: string | null;
  rewardClaimedAt: string | null;
  steps: GoalStep[];
};

type GoalRow = { id: string; title: string; why: string | null; target_day: string | null; created_at: Date; completed_at: Date | null; reward: string | null; reward_claimed_at: Date | null };
type StepRow = { id: string; goal_id: string; day: string; text: string; created_at: Date };

/** Every goal with its steps, oldest first, so the tree grows in the order you lived it. */
export async function listGoals(): Promise<Goal[]> {
  const sql = await db();
  const [goals, steps] = await Promise.all([
    sql<GoalRow[]>`select * from goals order by created_at asc limit 200`,
    sql<StepRow[]>`select * from goal_steps order by created_at asc limit 5000`,
  ]);
  const byGoal = new Map<string, GoalStep[]>();
  for (const s of steps) byGoal.set(s.goal_id, [...(byGoal.get(s.goal_id) ?? []), { id: s.id, day: s.day, text: s.text, createdAt: s.created_at.toISOString() }]);
  return goals.map((g) => ({
    id: g.id,
    title: g.title,
    why: g.why,
    targetDay: g.target_day,
    createdAt: g.created_at.toISOString(),
    completedAt: g.completed_at?.toISOString() ?? null,
    reward: g.reward,
    rewardClaimedAt: g.reward_claimed_at?.toISOString() ?? null,
    steps: byGoal.get(g.id) ?? [],
  }));
}

export async function insertGoal(g: { title: string; why: string | null; targetDay: string | null; reward: string | null }): Promise<string> {
  const sql = await db();
  const id = `goal_${randomToken(10)}`;
  await sql`insert into goals (id, title, why, target_day, reward) values (${id}, ${g.title}, ${g.why}, ${g.targetDay}, ${g.reward})`;
  return id;
}

export async function insertStep(goalId: string, day: string, text: string): Promise<void> {
  const sql = await db();
  await sql`insert into goal_steps (id, goal_id, day, text) values (${`step_${randomToken(10)}`}, ${goalId}, ${day}, ${text})`;
}

export async function setGoalDone(id: string, done: boolean): Promise<void> {
  const sql = await db();
  await sql`update goals set completed_at = ${done ? sql`coalesce(completed_at, now())` : null} where id = ${id}`;
}

export async function removeGoal(id: string): Promise<void> {
  const sql = await db();
  await sql`delete from goals where id = ${id}`;
}

export async function removeStep(id: string): Promise<void> {
  const sql = await db();
  await sql`delete from goal_steps where id = ${id}`;
}

export async function setRewardClaimed(id: string, claimed: boolean): Promise<void> {
  const sql = await db();
  await sql`update goals set reward_claimed_at = ${claimed ? sql`coalesce(reward_claimed_at, now())` : null} where id = ${id} and completed_at is not null`;
}
