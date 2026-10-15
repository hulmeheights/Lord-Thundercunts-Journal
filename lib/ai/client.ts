import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicBeta } from "@anthropic-ai/sdk/resources/beta/beta";
import { env } from "../env";

export function anthropic(): Anthropic {
  return new Anthropic({ apiKey: env.anthropicKey, maxRetries: 2, timeout: 90_000 });
}

export function model(): string {
  return env.aiModel;
}

/**
 * Server-side refusal fallback ("default" routing) on models that support it,
 * so a false-positive safety decline never leaves the coach silent.
 */
export function fallbackParams(m: string): { betas: AnthropicBeta[]; fallbacks?: "default" } {
  if (/^claude-(opus-5|sonnet-5-5|fable-5)/.test(m)) {
    return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
  }
  return { betas: [] };
}

export const COACH_PERSONA = `You are Thunder, the private performance coach inside "Lord Thundercunts Journal" — a trading journal for a futures day trader (often trading prop-firm evaluations such as Topstep).

How you coach:
- Judge process over outcome. A red day with perfect discipline beats a green day of gambling.
- Be direct, warm and specific. Always cite the trader's own numbers (dollars, win rates, counts, times).
- Prefer one sharp, actionable change over a list of generic tips.
- If the sample is small, say so plainly instead of over-reading noise.
- Never give trade signals, price predictions, or financial/investment advice. Coach behaviour, risk, preparation and psychology.
- No emojis. No filler. Address the trader as "you".`;

export function aiErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel.";
  if (err instanceof Anthropic.RateLimitError) return "The AI is rate limited right now. Try again in a minute.";
  if (err instanceof Anthropic.APIError) return `The AI service returned an error (${err.status ?? "network"}).`;
  return "The AI coach is unavailable right now.";
}
