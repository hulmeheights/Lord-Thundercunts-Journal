import "server-only";
import { z } from "zod";
import { db } from "../db";
import { sha256 } from "../crypto";
import { anthropic, COACH_PERSONA, fallbackParams, model } from "./client";

export const AiBriefingSchema = z.object({
  headline: z.string(),
  verdict: z.string(),
  wentWell: z.array(z.string()),
  toImprove: z.array(z.string()),
  oneThing: z.string(),
  grade: z.string(),
  question: z.string(),
});
export type AiBriefing = z.infer<typeof AiBriefingSchema>;

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "verdict", "wentWell", "toImprove", "oneThing", "grade", "question"],
  properties: {
    headline: { type: "string", description: "Punchy 3–8 word headline capturing the period." },
    verdict: { type: "string", description: "2–3 honest sentences on how the period went, citing specific numbers." },
    wentWell: { type: "array", items: { type: "string" }, description: "1–3 specific things that went well, each one sentence." },
    toImprove: { type: "array", items: { type: "string" }, description: "1–3 specific things to improve, each one sentence." },
    oneThing: { type: "string", description: "The single most important concrete behaviour for the next session. Imperative, under 20 words." },
    grade: { type: "string", enum: ["A+", "A", "A−", "B+", "B", "B−", "C+", "C", "C−", "D", "F"], description: "Overall grade weighted toward process (discipline, risk, patience) over P&L." },
    question: { type: "string", description: "One probing reflection question for tonight's journal entry." },
  },
} as const;

/** Generates (or returns the cached) AI narrative for a briefing. */
export async function aiBriefing(briefingId: string, context: Record<string, unknown>): Promise<AiBriefing | { error: string }> {
  const m = model();
  const inputHash = sha256(`${m}:${JSON.stringify(context)}`);
  const sql = await db();
  const cached = await sql<{ input_hash: string; content: unknown }[]>`select input_hash, content from briefings where id = ${briefingId}`;
  if (cached[0]?.input_hash === inputHash) {
    const parsed = AiBriefingSchema.safeParse(cached[0].content);
    if (parsed.success) return parsed.data;
  }

  const response = await anthropic().beta.messages.create({
    model: m,
    max_tokens: 6000,
    ...fallbackParams(m),
    output_config: { effort: "medium", format: { type: "json_schema", schema: JSON_SCHEMA as unknown as Record<string, unknown> } },
    system: `${COACH_PERSONA}\n\nYou are writing the trader's ${String(context.period)} briefing — it appears as slides they swipe through, so every line must earn its place.`,
    messages: [
      {
        role: "user",
        content: `Here is my data for this briefing as JSON. Amounts are USD net of fees.\n<data>\n${JSON.stringify(context)}\n</data>\nWrite my briefing.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") return { error: "The coach declined to write this briefing." };
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return { error: "The coach returned an empty briefing." };
  let json: unknown;
  try {
    json = JSON.parse(text.text);
  } catch {
    return { error: "The coach's briefing was malformed. Try again." };
  }
  const parsed = AiBriefingSchema.safeParse(json);
  if (!parsed.success) return { error: "The coach's briefing was incomplete. Try again." };

  await sql`
    insert into briefings (id, input_hash, content, model)
    values (${briefingId}, ${inputHash}, ${sql.json(parsed.data)}, ${m})
    on conflict (id) do update set input_hash = excluded.input_hash, content = excluded.content, model = excluded.model, created_at = now()
  `;
  return parsed.data;
}

export const ReflectionSchema = z.object({
  observations: z.array(z.string()),
  question: z.string(),
  encouragement: z.string(),
});
export type Reflection = z.infer<typeof ReflectionSchema>;

const REFLECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["observations", "question", "encouragement"],
  properties: {
    observations: { type: "array", items: { type: "string" }, description: "2–3 sharp observations connecting what they wrote to what the data shows." },
    question: { type: "string", description: "One question that pushes them to think deeper about today." },
    encouragement: { type: "string", description: "One honest, specific sentence of encouragement." },
  },
} as const;

export async function aiReflection(context: Record<string, unknown>): Promise<Reflection | { error: string }> {
  const m = model();
  const response = await anthropic().beta.messages.create({
    model: m,
    max_tokens: 4000,
    ...fallbackParams(m),
    output_config: { effort: "low", format: { type: "json_schema", schema: REFLECTION_SCHEMA as unknown as Record<string, unknown> } },
    system: `${COACH_PERSONA}\n\nYou are reading tonight's journal entry alongside the day's trades. Reflect it back like a great coach would.`,
    messages: [{ role: "user", content: `<day>\n${JSON.stringify(context)}\n</day>\nReflect on my day.` }],
  });
  if (response.stop_reason === "refusal") return { error: "The coach declined to reflect on this entry." };
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return { error: "Empty reflection." };
  try {
    const parsed = ReflectionSchema.safeParse(JSON.parse(text.text));
    return parsed.success ? parsed.data : { error: "Incomplete reflection. Try again." };
  } catch {
    return { error: "Malformed reflection. Try again." };
  }
}
