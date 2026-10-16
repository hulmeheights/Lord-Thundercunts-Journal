import { z } from "zod";
import { assertSameOrigin, assertSession } from "@/lib/auth/session";
import { aiConfigured } from "@/lib/env";
import { aiErrorMessage, anthropic, COACH_PERSONA, fallbackParams, model } from "@/lib/ai/client";
import { coachSnapshot } from "@/lib/ai/context";
import { getSettings } from "@/lib/data/settings";

export const maxDuration = 300;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(6000) }))
    .min(1)
    .max(40),
});

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    await assertSession();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const settings = await getSettings();
  if (!aiConfigured() || !settings.ai.enabled) return new Response("AI is not configured.", { status: 400 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const messages = parsed.data.messages;
  if (messages[0]!.role !== "user" || messages[messages.length - 1]!.role !== "user") {
    return new Response("Bad request", { status: 400 });
  }

  const snapshot = await coachSnapshot();
  const m = model();
  const stream = anthropic().beta.messages.stream({
    model: m,
    max_tokens: 32000,
    ...fallbackParams(m),
    // Medium holds quality for chat; the Observer (deep behavioural reading) stays on high.
    output_config: { effort: "medium" },
    // Also cache the conversation so far: each new message only pays full price for what's new.
    cache_control: { type: "ephemeral" },
    system: [
      {
        type: "text",
        text: `${COACH_PERSONA}\n\nYou're chatting with the trader inside the app. Keep answers tight (under ~180 words unless they ask for depth). Use short paragraphs or a few bullets. Reference their data below.`,
      },
      {
        type: "text",
        text: `<trader_data>\n${JSON.stringify(snapshot)}\n</trader_data>`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(encoder.encode("\n\nI can't help with that one — ask me about your trading."));
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n${aiErrorMessage(err)}`));
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
