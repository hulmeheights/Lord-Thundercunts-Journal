import { after } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { assertSameOrigin, assertSession } from "@/lib/auth/session";
import { aiConfigured } from "@/lib/env";
import { aiErrorMessage, anthropic, COACH_PERSONA, fallbackParams, model } from "@/lib/ai/client";
import { coachSnapshot } from "@/lib/ai/context";
import { getSettings } from "@/lib/data/settings";
import { isChatId, needsNote, newChatId, recentNotes, saveChat, setNote, type CoachMessage } from "@/lib/data/coach";
import { aiCoachNote } from "@/lib/ai/coachNote";
import { listTrades } from "@/lib/data/trades";
import { queryTrades, TradeQuery } from "@/lib/analytics/query";

/** The coach's one tool: exact slices of the full trade log, computed here, never guessed. */
const ANALYZE: Anthropic.Beta.BetaTool = {
  name: "analyze_trades",
  description:
    "Query the trader's full trade log (every synced or imported trade, all history) and get exact stats. Filter by date range, local entry time window, weekday, setup, symbol, side, win/loss or rule breaks; group by entry-time buckets of any size (e.g. 5, 10, 15 or 30 minutes), hour, weekday, day, week, month, setup, symbol, side, trade number of the day, hold time, rule-break or account; optionally list the individual trades. Each result has trades, net, winRate (%), avg, profitFactor, best, worst and netWithoutBest (net minus the single best trade, to spot one winner carrying a bucket). Call it whenever a question needs a breakdown, a time window or specific trades - several calls are fine.",
  input_schema: {
    type: "object",
    properties: {
      from: { type: "string", description: "First day, YYYY-MM-DD, trader's timezone. Omit for all history." },
      to: { type: "string", description: "Last day, YYYY-MM-DD." },
      entryFrom: { type: "string", description: "Only entries at or after this local time, HH:MM (24h)." },
      entryTo: { type: "string", description: "Only entries before this local time, HH:MM (24h)." },
      weekdays: { type: "array", items: { type: "string", enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] } },
      setup: { type: "string" },
      symbol: { type: "string", description: "Root such as MNQ or NQ." },
      direction: { type: "string", enum: ["long", "short"] },
      outcome: { type: "string", enum: ["win", "loss"] },
      ruleBreaks: { type: "string", enum: ["only", "exclude"] },
      groupBy: {
        type: "string",
        enum: ["none", "entryMinutes", "hour", "weekday", "day", "week", "month", "setup", "symbol", "direction", "tradeNumberOfDay", "holdTime", "ruleBreak", "account"],
      },
      bucketMinutes: { type: "integer", description: "Bucket size in minutes for groupBy entryMinutes. Default 15." },
      listTrades: { type: "boolean", description: "Also return the matching trades, newest first (up to 80)." },
    },
    additionalProperties: false,
  },
};
const MAX_TOOL_ROUNDS = 6;

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
  const m = model("deep");
  const tz = settings.profile.timezone;
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    {
      type: "text",
      text: `${COACH_PERSONA}\n\nYou're chatting with the trader inside the app. Keep answers tight (under ~180 words unless they ask for depth). Use short paragraphs or a few bullets. Reference their data below.\n\nThe trader_data snapshot summarises the last 90 days. For anything finer or different - a time window down to the minute, particular days or weeks, a setup, the individual trades, or anything older than 90 days - call analyze_trades and answer from its exact numbers. Never ask the trader to group, count, filter or paste trades: you have their full log through the tool, so do the work. Entry times are in the trader's timezone (${tz}). When a sample is small, say so, and use netWithoutBest to show whether one trade carries the result.`,
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
  ];

  let allTrades: Awaited<ReturnType<typeof listTrades>> | null = null;
  const runTool = async (input: unknown): Promise<string> => {
    const q = TradeQuery.safeParse(input);
    if (!q.success) throw new Error(`Invalid input: ${q.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`);
    allTrades ??= await listTrades({});
    return JSON.stringify(queryTrades(allTrades, q.data, settings.rules, tz));
  };

  const ask = (history: Anthropic.Beta.BetaMessageParam[], tools: boolean) =>
    anthropic().beta.messages.stream({
      model: m,
      max_tokens: 32000,
      ...fallbackParams(m),
      // Medium holds quality for chat; the Observer (deep behavioural reading) stays on high.
      output_config: { effort: "medium" },
      // Also cache the conversation so far: each new message only pays full price for what's new.
      cache_control: { type: "ephemeral" },
      // On the last round the tool stays declared (history has tool blocks) but can't be called.
      tools: [ANALYZE],
      ...(tools ? {} : { tool_choice: { type: "none" as const } }),
      system,
      messages: history,
    });

  const encoder = new TextEncoder();
  let current: ReturnType<typeof ask> | null = null;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const history: Anthropic.Beta.BetaMessageParam[] = messages.map((x) => ({ role: x.role, content: x.content }));
      let reply = "";
      const say = (text: string) => {
        reply += text;
        controller.enqueue(encoder.encode(text));
      };
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          current = ask(history, round < MAX_TOOL_ROUNDS);
          // Text between tool calls is kept apart from what comes next.
          if (reply && !/\s$/.test(reply)) say("\n\n");
          for await (const event of current) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") say(event.delta.text);
          }
          const final = await current.finalMessage();
          if (final.stop_reason === "refusal") {
            say(`${reply ? "\n\n" : ""}I can't help with that one — ask me about your trading.`);
            break;
          }
          const uses = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          if (final.stop_reason !== "tool_use" || !uses.length) break;
          // Pass the whole turn back unchanged (thinking blocks included), then every result in one message.
          history.push({ role: "assistant", content: final.content });
          const results = await Promise.all(
            uses.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
              try {
                return { type: "tool_result", tool_use_id: u.id, content: await runTool(u.input) };
              } catch (err) {
                return { type: "tool_result", tool_use_id: u.id, is_error: true, content: err instanceof Error ? err.message : "The query failed." };
              }
            }),
          );
          history.push({ role: "user", content: results });
        }
        if (reply.trim()) await saveChat(chatId, [...messages, { role: "assistant", content: reply.trim() } satisfies CoachMessage]);
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n${aiErrorMessage(err)}`));
      } finally {
        controller.close();
      }
    },
    cancel() {
      current?.abort();
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
