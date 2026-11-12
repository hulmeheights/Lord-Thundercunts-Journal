import { after, NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { Alert } from "@/lib/bot/signal";
import { secretOf, SorSignal } from "@/lib/bot/sor";
import { handleAlert, handleSignal, logEvent } from "@/lib/bot/engine";
import { webhookSecret } from "@/lib/bot/config";
import { z } from "zod";

/** The Pass Plan script's alert: a session's signal with its 4H bias and value area (no account rules: the journal holds those). */
const PassAlert = z.object({
  secret: z.string(),
  event: z.literal("pass"),
  session: z.enum(["ASIA", "LON", "NY"]),
  trading_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dir: z.enum(["LONG", "SHORT"]),
  price: z.number().finite().positive(),
  bias: z.enum(["UP", "DOWN"]).nullable(),
  vah: z.number().finite().nullable(),
  val: z.number().finite().nullable(),
  id: z.string().max(60),
});

export const dynamic = "force-dynamic";
// Orders on several accounts can take a few seconds; they run after the reply (below).
export const maxDuration = 60;

/**
 * TradingView → Autopilot. Public (TradingView can't log in), so the shared
 * secret inside the alert is the lock: compared in constant time, and the
 * body is capped and validated before anything else happens.
 */
export async function POST(req: Request) {
  const secret = webhookSecret();
  if (secret.length < 16) {
    await turnedAway("BOT_WEBHOOK_SECRET in Vercel is missing or under 16 characters: set it and redeploy");
    return NextResponse.json({ ok: false, error: "Autopilot isn't set up" }, { status: 503 });
  }
  const raw = await req.text();
  if (raw.length > 4000) {
    await turnedAway("the alert message was over 4,000 characters");
    return NextResponse.json({ ok: false }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    await turnedAway("the alert message wasn't JSON (check the alert's Message box, or use alert() function calls only with the Signals script)");
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const given = secretOf(body);
  if (!safeEqual(given, secret)) {
    await turnedAway(given ? "its secret doesn't match BOT_WEBHOOK_SECRET in Vercel (the script's Webhook Secret setting must be exactly the same)" : "it had no secret in it");
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const received = new Date();
  // MNQ Pass Plan: {"event":"pass", …}. Every account decides; live orders wait for the Mac, practice and Lucid start at once.
  if (typeof body === "object" && body && (body as { event?: unknown }).event === "pass") {
    const pa = PassAlert.safeParse(body);
    if (!pa.success) {
      await logEvent("error", `Pass plan alert didn't look right: ${pa.error.issues[0]?.path.join(".")} ${pa.error.issues[0]?.message}`);
      return NextResponse.json({ ok: false, error: "bad pass alert" }, { status: 400 });
    }
    const a = pa.data;
    after(async () => {
      try {
        const { passSignal } = await import("@/lib/pass/server");
        await passSignal({ session: a.session, tradingDay: a.trading_day, dir: a.dir, price: a.price, bias: a.bias, vah: a.vah, val: a.val, barTime: a.id });
      } catch (e) {
        await logEvent("error", `Pass plan webhook error: ${e instanceof Error ? e.message : String(e)}`).catch(() => {});
      }
    });
    return NextResponse.json({ ok: true, received: received.toISOString() });
  }
  // MNQ SOR v2: the script sends {"event":"signal", …} itself (alert() with its own message).
  if (typeof body === "object" && body && (body as { event?: unknown }).event === "signal") {
    const sig = SorSignal.safeParse(body);
    if (!sig.success) {
      await logEvent("error", `Signal didn't look right: ${sig.error.issues[0]?.path.join(".")} ${sig.error.issues[0]?.message}`);
      return NextResponse.json({ ok: false, error: "bad signal" }, { status: 400 });
    }
    after(async () => {
      try {
        await handleSignal(sig.data, received);
      } catch (e) {
        await logEvent("error", `Webhook error: ${e instanceof Error ? e.message : String(e)}`).catch(() => {});
      }
    });
    return NextResponse.json({ ok: true, received: received.toISOString() });
  }
  const parsed = Alert.safeParse(body);
  if (!parsed.success) {
    await logEvent("error", `Alert didn't look right: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
    return NextResponse.json({ ok: false, error: "bad alert" }, { status: 400 });
  }
  // TradingView gives up on a webhook after about 3 seconds, so reply at once and do the work straight after.
  after(async () => {
    try {
      await handleAlert(raw, parsed.data, received);
    } catch (e) {
      await logEvent("error", `Webhook error: ${e instanceof Error ? e.message : String(e)}`).catch(() => {});
    }
  });
  return NextResponse.json({ ok: true, received: received.toISOString() });
}


/**
 * An alert that never gets in must still show up in Autopilot's log, or a missed
 * trade looks like nothing happened. Never says what the secret was. At most
 * once every 10 minutes per reason, so a misconfigured alert can't flood the log.
 */
async function turnedAway(reason: string) {
  try {
    const { db } = await import("@/lib/db");
    const sql = await db();
    const message = `An alert from TradingView was turned away: ${reason}. Nothing was placed.`;
    const [recent] = await sql<{ n: number }[]>`select count(*)::int as n from bot_events where message = ${message} and created_at > now() - interval '10 minutes'`;
    if (!recent?.n) {
      await logEvent("error", message);
      const { botNotify } = await import("@/lib/bot/notify");
      await botNotify(`⚠ A TradingView alert was turned away\n${reason}. Nothing was placed.`, { push: true, critical: true });
    }
  } catch {
    // logging must never break the reply
  }
}
