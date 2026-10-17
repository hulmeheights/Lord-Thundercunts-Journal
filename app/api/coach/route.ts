import { after } from "next/server";
import { z } from "zod";
import { assertSameOrigin, assertSession } from "@/lib/auth/session";
import { aiConfigured } from "@/lib/env";
import { aiErrorMessage, anthropic, COACH_PERSONA, fallbackParams, model } from "@/lib/ai/client";
import { coachSnapshot } from "@/lib/ai/context";
import { getSettings } from "@/lib/data/settings";
import { isChatId, needsNote, newChatId, recentNotes, saveChat, setNote, type CoachMessage } from "@/lib/data/coach";
import { aiCoachNote } from "@/lib/ai/coachNote";

export const maxDuration = 300;

const Body = z.object({
  chatId: z.string().max(60).nullish(), // null on a brand-new chat
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(20000) }))
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
  const chatId = isChatId(parsed.data.chatId) ? parsed.data.chatId : newChatId();
  if (messages[0]!.role !== "user" || messages[messages.length - 1]!.role !== "user") {
    return new Response("Bad request", { status: 400 });
  }

  const [snapshot, notes] = await Promise.all([coachSnapshot(), recentNotes(chatId)]);
  const memory = notes.length
    ? notes.map((n) => `- ${n.at} · ${n.title}: ${n.note}${n.commitments.length ? ` Committed to: ${n.commitments.join("; ")}.` : ""}`).join("\n")
    : "(no earlier conversations)";
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
      },
      {
        type: "text",
        text: `<coach_notes>\nYour notes from recent conversations with this trader, newest first. Follow up on commitments naturally when relevant (did they do it? what does the data say?). Don't repeat old advice the data shows they've moved past, and don't mention the notes unless it helps.\n${memory}\n</coach_notes>`,
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
        let reply = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        if (final.stop_reason === "refusal") {
          const sorry = "I can't help with that one — ask me about your trading.";
          controller.enqueue(encoder.encode(`\n\n${sorry}`));
          reply = reply ? `${reply}\n\n${sorry}` : sorry;
        }
        if (reply.trim()) await saveChat(chatId, [...messages, { role: "assistant", content: reply } satisfies CoachMessage]);
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

  // Once the reply has gone out: refresh this chat's note (first exchange, then every two).
  after(async () => {
    try {
      const history = await needsNote(chatId);
      if (!history) return;
      const draft = await aiCoachNote(history);
      if (draft) await setNote(chatId, { ...draft, count: history.length });
    } catch {
      /* a missed note is retried next time; never break the chat */
    }
  });

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no", "x-chat-id": chatId },
  });
}
