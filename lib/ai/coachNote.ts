import "server-only";
import { z } from "zod";
import type { CoachMessage } from "../data/coach";
import { anthropic, fallbackParams, model } from "./client";

const NoteSchema = z.object({ title: z.string(), note: z.string(), commitments: z.array(z.string()) });
export type CoachNoteDraft = z.infer<typeof NoteSchema>;

const NOTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "note", "commitments"],
  properties: {
    title: { type: "string", description: "3-7 words naming what the conversation was about." },
    note: { type: "string", description: "One to three short sentences: what was discussed and any conclusion reached. Plain, factual, no fluff." },
    commitments: { type: "array", items: { type: "string" }, description: "Concrete things the trader said they would do (0-3), in their words where possible. Empty if none." },
  },
} as const;

/**
 * Writes the coach's memory of one conversation: a title, a two-line note and
 * any commitments. A summary, so low effort holds quality and keeps it cheap.
 */
export async function aiCoachNote(messages: CoachMessage[]): Promise<CoachNoteDraft | null> {
  const m = model();
  const transcript = messages.map((x) => `${x.role === "user" ? "Trader" : "Coach"}: ${x.content}`).join("\n\n").slice(-24000);
  const response = await anthropic().beta.messages.create({
    model: m,
    max_tokens: 4000,
    ...fallbackParams(m),
    output_config: { effort: "low", format: { type: "json_schema", schema: NOTE_SCHEMA as unknown as Record<string, unknown> } },
    system:
      "You keep the coach's notebook for a trading journal. Summarise a coaching conversation so a future conversation can follow up on it. Record only what was actually said. If the conversation had no real substance, say so in the note and leave commitments empty.",
    messages: [{ role: "user", content: `<conversation>\n${transcript}\n</conversation>` }],
  });
  if (response.stop_reason === "refusal") return null;
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return null;
  try {
    const parsed = NoteSchema.safeParse(JSON.parse(text.text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
