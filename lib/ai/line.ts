import "server-only";
import { z } from "zod";
import { anthropic, COACH_PERSONA, fallbackParams, model } from "./client";

const LineSchema = z.object({ line: z.string().min(1).max(220), cite: z.string().min(1).max(60) });
export type PersonalLine = z.infer<typeof LineSchema>;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["line", "cite"],
  properties: {
    line: { type: "string", description: "One sentence, at most 22 words, second person, grounded only in the facts given." },
    cite: { type: "string", description: "2–5 words naming what it's drawn from, e.g. 'your last 90 days' or 'your ledger'." },
  },
} as const;

const PAGE_BRIEF = {
  insights: "the Insights page, which breaks down the trader's own trades (hours, setups, days, mistakes, readiness)",
  guardian: "the Guardian page, which tracks prop-firm evals bought, passed and blown, payouts, fees, and how the trader has been feeling",
} as const;

/**
 * The closing line on a page, written from the trader's own numbers instead of
 * a stock quote. Haiku at low effort: one short sentence costs a fraction of a cent.
 */
export async function aiPersonalLine(page: keyof typeof PAGE_BRIEF, facts: Record<string, unknown>): Promise<PersonalLine | null> {
  const m = model("light");
  const response = await anthropic().beta.messages.create({
    model: m,
    max_tokens: 2000,
    ...fallbackParams(m),
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
    system: `${COACH_PERSONA}\n\nYou write the single closing line that sits, like a pull quote, at the bottom of ${PAGE_BRIEF[page]}. Make it the most useful true thing the facts show — a strength to protect or a leak to close — said the way a great coach would say it. Use only numbers that appear in the facts. No quotation marks, no hashtags, no emojis.`,
    messages: [{ role: "user", content: `<facts>\n${JSON.stringify(facts)}\n</facts>\nWrite the line.` }],
  });
  if (response.stop_reason === "refusal") return null;
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return null;
  try {
    const parsed = LineSchema.safeParse(JSON.parse(text.text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
