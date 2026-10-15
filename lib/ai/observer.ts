import "server-only";
import { z } from "zod";
import { anthropic, fallbackParams, model } from "./client";

export const ObserverCaseFileSchema = z.object({
  wants: z.string(),
  doing: z.array(z.string()),
  stopping: z.string(),
  gap: z.string(),
  tell: z.array(z.object({ when: z.string(), then: z.string() })),
  letter: z.string(),
  question: z.string(),
});
export type ObserverCaseFile = z.infer<typeof ObserverCaseFileSchema>;

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["wants", "doing", "stopping", "gap", "tell", "letter", "question"],
  properties: {
    wants: { type: "string", description: "1–2 sentences, third person: what the trader truly wants, combining what they wrote with their goals and rules." },
    doing: { type: "array", items: { type: "string" }, description: "2–4 observed behaviours, third person, each citing a specific number from the data." },
    stopping: { type: "string", description: "2–3 sentences, third person: the real obstacle, why it happens (the mechanism), and what it costs in dollars." },
    gap: { type: "string", description: "1–2 sentences comparing what the trader believes is stopping them with what the data shows. Kind but honest." },
    tell: {
      type: "array",
      description: "1–3 if-then instructions an outsider would give, most important first.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["when", "then"],
        properties: {
          when: { type: "string", description: "A concrete, observable trigger, e.g. 'the second losing trade of the day closes'." },
          then: { type: "string", description: "One specific action, imperative, under 18 words." },
        },
      },
    },
    letter: { type: "string", description: "3–5 sentences addressed directly to the trader by name, the way a wise friend who has watched every trade would say it." },
    question: { type: "string", description: "One question for the trader to sit with before the next session." },
  },
} as const;

/**
 * Writes the Observer's case file: the trader's situation described from the
 * outside. Third-person self-distancing — reasoning about yourself as you would
 * about someone else — is the whole point, so the voice rules are strict.
 */
export async function aiCaseFile(args: {
  name: string;
  pronoun: "they" | "he" | "she";
  dossier: Record<string, unknown>;
  written: { wants: string | null; doing: string | null; stopping: string | null; advice: string | null; believed: string[] };
}): Promise<ObserverCaseFile | { error: string }> {
  const m = model();
  const p = args.pronoun === "he" ? "he/him/his" : args.pronoun === "she" ? "she/her/her" : "they/them/their";
  const response = await anthropic().beta.messages.create({
    model: m,
    max_tokens: 6000,
    ...fallbackParams(m),
    output_config: { effort: "medium", format: { type: "json_schema", schema: JSON_SCHEMA as unknown as Record<string, unknown> } },
    system: `You are the Observer inside "Lord Thundercunts Journal", a private trading journal for a futures day trader on prop-firm accounts.

The trader has stepped outside themselves to look at their trading from a third-person perspective — the way a wise, impartial mentor watching every trade would see it. Research on self-distancing ("Solomon's paradox") shows people reason far more wisely about someone else's problems than their own; your job is to give them that outside view.

Voice rules:
- Refer to the trader as "${args.name}" and use the pronouns ${p}. Never use "you" or "I", except in "letter", which speaks directly to ${args.name}.
- Calm, specific, unsentimental, kind. Every claim must be grounded in the data provided — cite numbers. If the sample is small, say so.
- Explain mechanisms (why the behaviour happens), not just symptoms.
- Coach process, risk and psychology only. Never give trade signals, price predictions or financial advice.
- No emojis, no filler, no headings inside strings.`,
    messages: [
      {
        role: "user",
        content: `Here is the evidence the journal gathered about ${args.name} (USD, net of fees):
<dossier>
${JSON.stringify(args.dossier)}
</dossier>

And here is what ${args.name} wrote when stepping outside themselves:
<written>
${JSON.stringify(args.written)}
</written>

Write the Observer's case file.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") return { error: "The Observer declined to write this one." };
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return { error: "The Observer returned nothing. Try again." };
  try {
    const parsed = ObserverCaseFileSchema.safeParse(JSON.parse(text.text));
    return parsed.success ? parsed.data : { error: "The case file was incomplete. Try again." };
  } catch {
    return { error: "The case file was malformed. Try again." };
  }
}
